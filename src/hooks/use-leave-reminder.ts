"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { PlannedRoute, RouteLeg, DelayInfo } from "@/lib/types";

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

const STORAGE_KEY = "transit-leave-reminder";
const ROUTE_SNAPSHOT_KEY = "transit-reminder-route-snapshot";
const ADAPTIVE_POLL_MS = 20_000;
const RESCHEDULE_THRESHOLD_MS = 60_000;
const SAFETY_BUFFER_SECONDS = 2 * 60;
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function parseDurationSeconds(duration?: string): number {
  if (!duration) return 0;
  const match = duration.match(/(\d+)s/);
  return match ? parseInt(match[1], 10) : 0;
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
    } else {
      if (!firstTransitDep && leg.scheduledDeparture) {
        firstTransitDep = new Date(leg.scheduledDeparture);
        firstTransitLeg = leg;
        lineNumber = leg.lineNumber ?? "";
        departureStop = leg.departureStop ?? "";
        break;
      }
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

async function fetchLegDelay(leg: RouteLeg): Promise<DelayInfo | null> {
  const params = new URLSearchParams();
  if (leg.lineNumber) params.set("line", leg.lineNumber);
  if (leg.mode) params.set("type", leg.mode);
  if (leg.departureStop) params.set("depStop", leg.departureStop);
  if (leg.departureStopLat != null)
    params.set("depLat", String(leg.departureStopLat));
  if (leg.departureStopLng != null)
    params.set("depLng", String(leg.departureStopLng));
  if (leg.arrivalStop) params.set("arrStop", leg.arrivalStop);
  if (leg.arrivalStopLat != null)
    params.set("arrLat", String(leg.arrivalStopLat));
  if (leg.arrivalStopLng != null)
    params.set("arrLng", String(leg.arrivalStopLng));
  if (leg.scheduledDeparture)
    params.set("scheduledDep", leg.scheduledDeparture);

  try {
    const res = await fetch(`/api/leg-delay?${params}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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

function buildReminderText(
  baseInfo: ReminderBaseInfo,
  notifyAtMs: number,
  delaySeconds: number,
): { title: string; body: string } {
  const line = baseInfo.lineNumber || "Transit";
  const leaveAt = formatTime(notifyAtMs);
  const depTime = formatTime(
    baseInfo.scheduledDepartureMs + delaySeconds * 1000,
  );
  const delayLabel = formatDelayLabel(delaySeconds);
  const walkText =
    baseInfo.walkMinutes > 0
      ? `${baseInfo.walkMinutes} min walk`
      : "Head there";
  const stopText = baseInfo.departureStop || "your stop";

  return {
    title: `Leave ${leaveAt} · Line ${line}`,
    body: `${stopText} | ${walkText} | dep ${depTime} (${delayLabel})`,
  };
}

async function scheduleServerReminder(
  subscription: PushSubscription,
  notifyAt: number,
  title: string,
  body: string,
) {
  await fetch("/api/push", {
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
    }),
  });
}

// --- VAPID / push subscription ---

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

async function getPushSubscription(): Promise<PushSubscription | null> {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    const pubKey = await fetch("/api/push").then((r) => r.text());
    if (!pubKey) return null;
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pubKey),
    });
  } catch {
    return null;
  }
}

// --- localStorage (persists isSet state across reloads) ---

interface StoredReminder {
  endpoint: string;
  notifyAt: number;
  routeKey?: string;
}

interface StoredRouteSnapshot {
  route: PlannedRoute;
  savedAt: number;
}

function saveReminder(data: StoredReminder) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function clearStoredReminder() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
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

function loadStoredReminder(): StoredReminder | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredReminder;
    if (data.notifyAt > Date.now()) return data;
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

export function useLeaveReminder(route: PlannedRoute | null) {
  const [isSet, setIsSet] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [minutesUntil, setMinutesUntil] = useState<number | null>(null);
  const [notifyAtMs, setNotifyAtMs] = useState<number | null>(null);
  const [isLiveAdjusted, setIsLiveAdjusted] = useState(false);

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

  // Sync notification permission on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    Promise.resolve().then(() => setPermission(Notification.permission));
  }, []);

  // Restore isSet from localStorage on mount
  useEffect(() => {
    async function restore() {
      const stored = loadStoredReminder();
      if (stored) {
        setIsSet(true);
        setNotifyAtMs(stored.notifyAt);
      }
    }
    restore();
  }, []);

  // Countdown timer
  useEffect(() => {
    const targetMs = notifyAtMs ?? baseInfo?.baseLeaveTimeMs ?? null;
    if (!targetMs) {
      Promise.resolve().then(() => setMinutesUntil(null));
      return;
    }
    const update = () =>
      setMinutesUntil(Math.round((targetMs - Date.now()) / 60_000));
    update();
    const tick = setInterval(update, 30_000);
    return () => clearInterval(tick);
  }, [notifyAtMs, baseInfo?.baseLeaveTimeMs]);

  const scheduleReminder = useCallback(async () => {
    if (
      !baseInfo ||
      typeof window === "undefined" ||
      !("Notification" in window)
    )
      return;

    let perm = permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
      setPermission(perm);
    }
    if (perm !== "granted") return;

    const sub = await getPushSubscription();
    if (!sub) return;

    let delaySeconds = 0;
    if (baseInfo.firstTransitLeg) {
      const liveDelay = await fetchLegDelay(baseInfo.firstTransitLeg);
      delaySeconds = liveDelay?.estimatedDelaySeconds ?? 0;
    }
    let nextNotifyAt = computeNotifyAtMs(baseInfo, delaySeconds);
    if (nextNotifyAt < Date.now() + 5_000) nextNotifyAt = Date.now() + 5_000;

    const text = buildReminderText(baseInfo, nextNotifyAt, delaySeconds);
    await scheduleServerReminder(sub, nextNotifyAt, text.title, text.body);

    saveReminder({
      endpoint: sub.endpoint,
      notifyAt: nextNotifyAt,
      routeKey,
    });
    if (route) {
      saveRouteSnapshot(route);
    }
    setIsSet(true);
    setNotifyAtMs(nextNotifyAt);
    setIsLiveAdjusted(
      Math.abs(nextNotifyAt - baseInfo.baseLeaveTimeMs) >=
        RESCHEDULE_THRESHOLD_MS,
    );
  }, [baseInfo, permission, routeKey, route]);

  // Adaptive rescheduling while reminder is active.
  useEffect(() => {
    if (!isSet || !baseInfo || !baseInfo.firstTransitLeg) return;
    let cancelled = false;

    const run = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub || cancelled) return;

        const liveDelay = await fetchLegDelay(baseInfo.firstTransitLeg!);
        if (cancelled) return;

        const delaySeconds = liveDelay?.estimatedDelaySeconds ?? 0;
        let nextNotifyAt = computeNotifyAtMs(baseInfo, delaySeconds);
        if (nextNotifyAt < Date.now() + 5_000)
          nextNotifyAt = Date.now() + 5_000;

        const prevNotifyAt = notifyAtMs ?? baseInfo.baseLeaveTimeMs;
        const needsReschedule =
          Math.abs(nextNotifyAt - prevNotifyAt) >= RESCHEDULE_THRESHOLD_MS;

        setIsLiveAdjusted(
          Math.abs(nextNotifyAt - baseInfo.baseLeaveTimeMs) >=
            RESCHEDULE_THRESHOLD_MS,
        );

        if (!needsReschedule) return;

        const text = buildReminderText(baseInfo, nextNotifyAt, delaySeconds);
        await scheduleServerReminder(sub, nextNotifyAt, text.title, text.body);
        if (cancelled) return;

        saveReminder({
          endpoint: sub.endpoint,
          notifyAt: nextNotifyAt,
          routeKey,
        });
        setNotifyAtMs(nextNotifyAt);
      } catch {
        // Ignore transient failures; next poll will retry.
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
  }, [isSet, baseInfo, notifyAtMs, routeKey]);

  const clearReminder = useCallback(async () => {
    clearStoredReminder();
    if (!hasFreshRouteSnapshot()) {
      clearRouteSnapshot();
    }
    setIsSet(false);
    setNotifyAtMs(null);
    setIsLiveAdjusted(false);
    // Cancel on the server — fire-and-forget
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
    } catch {}
  }, []);

  return {
    leaveInfo,
    isSet,
    isLiveAdjusted,
    permission,
    minutesUntil,
    scheduleReminder,
    clearReminder,
  };
}
