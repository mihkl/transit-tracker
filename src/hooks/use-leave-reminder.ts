"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { PlannedRoute, RouteLeg } from "@/lib/types";
import { parseDurationSeconds } from "@/lib/route-time";
import { fetchLegDelay } from "@/lib/leg-delay";

export interface LeaveInfo {
  leaveTime: Date;
  walkMinutes: number;
  lineNumber: string;
  depTimeStr: string;
  departureStop: string;
}

interface ReminderBaseInfo extends LeaveInfo {
  baseLeaveTimeMs: number;
  walkBeforeSeconds: number;
  firstTransitLeg: RouteLeg | null;
  scheduledDepartureMs: number;
}

interface StoredReminder {
  endpoint: string;
  notifyAt: number;
  routeKey?: string;
  lastDelaySeconds?: number;
  lastDelayPushAt?: number;
}

interface StoredRouteSnapshot {
  route: PlannedRoute;
  savedAt: number;
}

const STORAGE_KEY = "transit-leave-reminder";
const ROUTE_SNAPSHOT_KEY = "transit-reminder-route-snapshot";
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const SAFETY_BUFFER_SECONDS = 2 * 60;
const RESCHEDULE_THRESHOLD_MS = 60_000;
const ADAPTIVE_POLL_MS = 20_000;
const DELAY_NOTIFY_THRESHOLD_S = 120;
const DELAY_NOTIFY_COOLDOWN_MS = 5 * 60_000;

function formatTime(dateMs: number): string {
  return new Date(dateMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDelayLabel(delaySeconds: number): string {
  const mins = Math.round(Math.abs(delaySeconds) / 60);
  if (mins <= 0) return "on time";
  return delaySeconds > 0 ? `${mins} min late` : `${mins} min early`;
}

function getReminderBaseInfo(route: PlannedRoute): ReminderBaseInfo | null {
  let walkBeforeSeconds = 0;
  let firstTransitDep: Date | null = null;
  let firstTransitLeg: RouteLeg | null = null;
  let lineNumber = "";
  let departureStop = "";

  for (const leg of route.legs) {
    if (leg.mode === "WALK") {
      if (!firstTransitDep) {
        walkBeforeSeconds += parseDurationSeconds(leg.duration);
      }
    } else if (!firstTransitDep && leg.scheduledDeparture) {
      firstTransitDep = new Date(leg.scheduledDeparture);
      firstTransitLeg = leg;
      lineNumber = leg.lineNumber ?? "";
      departureStop = leg.departureStop ?? "";
      break;
    }
  }

  if (!firstTransitDep) return null;

  const leaveMs =
    firstTransitDep.getTime() -
    walkBeforeSeconds * 1000 -
    SAFETY_BUFFER_SECONDS * 1000;

  if (leaveMs < Date.now() - 60_000) return null;

  return {
    leaveTime: new Date(leaveMs),
    walkMinutes: Math.round(walkBeforeSeconds / 60),
    lineNumber,
    depTimeStr: firstTransitDep.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    departureStop,
    baseLeaveTimeMs: leaveMs,
    walkBeforeSeconds,
    firstTransitLeg,
    scheduledDepartureMs: firstTransitDep.getTime(),
  };
}

function computeNotifyAtMs(
  baseInfo: ReminderBaseInfo,
  delaySeconds: number,
): number {
  return (
    baseInfo.scheduledDepartureMs +
    delaySeconds * 1000 -
    baseInfo.walkBeforeSeconds * 1000 -
    SAFETY_BUFFER_SECONDS * 1000
  );
}

function buildLeaveReminderText(
  baseInfo: ReminderBaseInfo,
  notifyAtMs: number,
  delaySeconds: number,
): { title: string; body: string } {
  const line = baseInfo.lineNumber || "Transit";
  const leaveAt = formatTime(notifyAtMs);
  const depTime = formatTime(baseInfo.scheduledDepartureMs + delaySeconds * 1000);
  const stopText = baseInfo.departureStop || "your stop";
  const walkText =
    baseInfo.walkMinutes > 0 ? `${baseInfo.walkMinutes} min walk` : "Head there";

  return {
    title: `Leave ${leaveAt} · Line ${line}`,
    body: `${stopText} | ${walkText} | dep ${depTime} (${formatDelayLabel(delaySeconds)})`,
  };
}

function buildDelayUpdateText(
  baseInfo: ReminderBaseInfo,
  notifyAtMs: number,
  delaySeconds: number,
): { title: string; body: string } {
  const line = baseInfo.lineNumber || "Transit";
  return {
    title: `Update · Line ${line} ${formatDelayLabel(delaySeconds)}`,
    body: `New leave time ${formatTime(notifyAtMs)} from ${baseInfo.departureStop || "your stop"}`,
  };
}

async function schedulePush(
  subscription: PushSubscription,
  notifyAt: number,
  title: string,
  body: string,
  jobKey: string,
  endpoint: string,
) {
  const response = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      notifyAt,
      title,
      body,
      tag: "leave-reminder",
      url: "/?trip=1",
      timestamp: notifyAt,
      category: "leave-reminder",
      endpoint,
      jobKey,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to schedule push notification");
  }
}

function saveReminder(data: StoredReminder) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function loadStoredReminder(): StoredReminder | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredReminder;
    if (data.notifyAt > Date.now() - 30 * 60_000) return data;
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function clearStoredReminder() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function hasMatchingRoute(
  stored: StoredReminder | null,
  routeKey: string,
): stored is StoredReminder & { routeKey: string } {
  return !!stored && !!routeKey && stored.routeKey === routeKey;
}

function saveRouteSnapshot(route: PlannedRoute) {
  try {
    const payload: StoredRouteSnapshot = {
      route,
      savedAt: Date.now(),
    };
    localStorage.setItem(ROUTE_SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {}
}

function clearRouteSnapshot() {
  try {
    localStorage.removeItem(ROUTE_SNAPSHOT_KEY);
  } catch {}
}

function hasFreshRouteSnapshot(): boolean {
  try {
    const raw = localStorage.getItem(ROUTE_SNAPSHOT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredRouteSnapshot;
    return Date.now() - parsed.savedAt <= SNAPSHOT_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    bytes[i] = rawData.charCodeAt(i);
  }
  return bytes;
}

async function getPushSubscription(): Promise<{
  subscription: PushSubscription | null;
  error: string | null;
}> {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    return {
      subscription: null,
      error: "Push is not available in this browser context.",
    };
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return { subscription: existing, error: null };

    const keyResp = await fetch("/api/push");
    if (!keyResp.ok) {
      return {
        subscription: null,
        error: "Push service is not configured on the server.",
      };
    }

    const pubKey = await keyResp.text();
    if (!pubKey) {
      return {
        subscription: null,
        error: "Missing push public key.",
      };
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pubKey),
    });
    return { subscription, error: null };
  } catch {
    return {
      subscription: null,
      error:
        "Could not enable push notifications. Private/incognito mode may block this.",
    };
  }
}

export function useLeaveReminder(route: PlannedRoute | null) {
  const [isSet, setIsSet] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [minutesUntil, setMinutesUntil] = useState<number | null>(null);
  const [notifyAtMs, setNotifyAtMs] = useState<number | null>(null);
  const [isLiveAdjusted, setIsLiveAdjusted] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const baseInfo = useMemo(
    () => (route ? getReminderBaseInfo(route) : null),
    [route],
  );

  const routeKey = useMemo(
    () =>
      route
        ? route.legs
            .map(
              (leg) =>
                `${leg.mode}|${leg.lineNumber ?? ""}|${leg.departureStop ?? ""}|${leg.scheduledDeparture ?? ""}`,
            )
            .join(">")
        : "",
    [route],
  );

  const leaveInfo: LeaveInfo | null = baseInfo
    ? {
        leaveTime: new Date(notifyAtMs ?? baseInfo.baseLeaveTimeMs),
        walkMinutes: baseInfo.walkMinutes,
        lineNumber: baseInfo.lineNumber,
        depTimeStr: baseInfo.depTimeStr,
        departureStop: baseInfo.departureStop,
      }
    : null;

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    Promise.resolve().then(() => setPermission(Notification.permission));
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      const stored = loadStoredReminder();
      if (hasMatchingRoute(stored, routeKey)) {
        setIsSet(true);
        setNotifyAtMs(stored.notifyAt);
        if (baseInfo) {
          setIsLiveAdjusted(
            Math.abs(stored.notifyAt - baseInfo.baseLeaveTimeMs) >=
              RESCHEDULE_THRESHOLD_MS,
          );
        } else {
          setIsLiveAdjusted(false);
        }
      } else {
        setIsSet(false);
        setNotifyAtMs(null);
        setIsLiveAdjusted(false);
      }
    });
  }, [routeKey, baseInfo]);

  useEffect(() => {
    const targetMs = isSet
      ? (notifyAtMs ?? null)
      : (baseInfo?.baseLeaveTimeMs ?? null);
    if (!targetMs) {
      Promise.resolve().then(() => setMinutesUntil(null));
      return;
    }
    const update = () =>
      setMinutesUntil(Math.round((targetMs - Date.now()) / 60_000));
    update();
    const tick = setInterval(update, 30_000);
    return () => clearInterval(tick);
  }, [isSet, notifyAtMs, baseInfo?.baseLeaveTimeMs]);

  const scheduleReminder = useCallback(async () => {
    if (
      !route ||
      !baseInfo ||
      typeof window === "undefined" ||
      !("Notification" in window)
    )
      return;

    try {
      let perm = permission;
      if (perm === "default") {
        perm = await Notification.requestPermission();
        setPermission(perm);
      }
      if (perm !== "granted") {
        setLastError("Notification permission is blocked.");
        return;
      }

      const { subscription: sub, error } = await getPushSubscription();
      if (!sub) {
        setLastError(error ?? "Unable to create push subscription.");
        return;
      }

      let delaySeconds = 0;
      if (baseInfo.firstTransitLeg) {
        const liveDelay = await fetchLegDelay(baseInfo.firstTransitLeg);
        delaySeconds = liveDelay?.estimatedDelaySeconds ?? 0;
      }

      let nextNotifyAt = computeNotifyAtMs(baseInfo, delaySeconds);
      if (nextNotifyAt < Date.now() + 5_000) nextNotifyAt = Date.now() + 5_000;

      const reminderText = buildLeaveReminderText(
        baseInfo,
        nextNotifyAt,
        delaySeconds,
      );
      await schedulePush(
        sub,
        nextNotifyAt,
        reminderText.title,
        reminderText.body,
        "leave-main",
        sub.endpoint,
      );

      saveReminder({
        endpoint: sub.endpoint,
        notifyAt: nextNotifyAt,
        routeKey,
        lastDelaySeconds: delaySeconds,
        lastDelayPushAt: 0,
      });
      saveRouteSnapshot(route);

      setIsSet(true);
      setNotifyAtMs(nextNotifyAt);
      setIsLiveAdjusted(
        Math.abs(nextNotifyAt - baseInfo.baseLeaveTimeMs) >=
          RESCHEDULE_THRESHOLD_MS,
      );
      setLastError(null);
    } catch {
      setLastError("Failed to schedule reminder. Please try again.");
    }
  }, [route, baseInfo, permission, routeKey]);

  // Adaptive mode: keep one main reminder updated and only push delay updates sparingly.
  useEffect(() => {
    if (!isSet || !baseInfo || !baseInfo.firstTransitLeg) return;

    let cancelled = false;

    const run = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub || cancelled) return;

        const stored = loadStoredReminder();
        if (!hasMatchingRoute(stored, routeKey)) return;

        const liveDelay = await fetchLegDelay(baseInfo.firstTransitLeg!);
        if (cancelled) return;

        const delaySeconds = liveDelay?.estimatedDelaySeconds ?? 0;
        let nextNotifyAt = computeNotifyAtMs(baseInfo, delaySeconds);
        if (nextNotifyAt < Date.now() + 5_000) nextNotifyAt = Date.now() + 5_000;

        const prevNotifyAt = stored.notifyAt;
        const needsReschedule =
          Math.abs(nextNotifyAt - prevNotifyAt) >= RESCHEDULE_THRESHOLD_MS;

        if (needsReschedule) {
          const text = buildLeaveReminderText(baseInfo, nextNotifyAt, delaySeconds);
          await schedulePush(
            sub,
            nextNotifyAt,
            text.title,
            text.body,
            "leave-main",
            sub.endpoint,
          );
          if (cancelled) return;
          setNotifyAtMs(nextNotifyAt);
        }

        const prevDelaySeconds = stored.lastDelaySeconds ?? 0;
        const delayChangedBy = Math.abs(delaySeconds - prevDelaySeconds);
        const cooldownPassed =
          Date.now() - (stored.lastDelayPushAt ?? 0) >= DELAY_NOTIFY_COOLDOWN_MS;
        const isBeforeReminder = nextNotifyAt > Date.now() + 60_000;

        let lastDelayPushAt = stored.lastDelayPushAt ?? 0;
        if (delayChangedBy >= DELAY_NOTIFY_THRESHOLD_S && cooldownPassed && isBeforeReminder) {
          const delayText = buildDelayUpdateText(baseInfo, nextNotifyAt, delaySeconds);
          await schedulePush(
            sub,
            Date.now() + 1_000,
            delayText.title,
            delayText.body,
            `delay-update-${Date.now()}`,
            sub.endpoint,
          );
          if (cancelled) return;
          lastDelayPushAt = Date.now();
        }

        saveReminder({
          ...stored,
          endpoint: sub.endpoint,
          notifyAt: nextNotifyAt,
          routeKey,
          lastDelaySeconds: delaySeconds,
          lastDelayPushAt,
        });

        setIsLiveAdjusted(
          Math.abs(nextNotifyAt - baseInfo.baseLeaveTimeMs) >=
            RESCHEDULE_THRESHOLD_MS,
        );
      } catch {
        // Ignore transient failures.
      }
    };

    run();
    const timer = setInterval(run, ADAPTIVE_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isSet, baseInfo, routeKey]);

  const clearReminder = useCallback(async () => {
    const stored = loadStoredReminder();
    if (!hasMatchingRoute(stored, routeKey)) return;
    clearStoredReminder();
    if (!hasFreshRouteSnapshot()) {
      clearRouteSnapshot();
    }

    setIsSet(false);
    setNotifyAtMs(null);
    setIsLiveAdjusted(false);
    setLastError(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            jobPrefix: "delay-update-",
          }),
        });
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, jobPrefix: "leave-main" }),
        });
      } else if (stored?.endpoint) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: stored.endpoint }),
        });
      }
    } catch {}
  }, [routeKey]);

  return {
    leaveInfo,
    isSet,
    isLiveAdjusted,
    permission,
    minutesUntil,
    lastError,
    scheduleReminder,
    clearReminder,
  };
}
