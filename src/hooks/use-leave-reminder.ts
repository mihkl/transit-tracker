"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { PlannedRoute, RouteLeg } from "@/lib/types";
import { parseDurationSeconds } from "@/lib/route-time";
import { fetchLegDelayAsync } from "@/lib/leg-delay";

export interface LeaveInfo {
  leaveTime: Date;
  walkMinutes: number;
  lineNumber: string;
  depTimeStr: string;
  departureStop: string;
}

export interface ReminderStatusMessage {
  tone: "info" | "warning" | "error";
  message: string;
}

interface ReminderBaseInfo extends LeaveInfo {
  baseLeaveTimeMs: number;
  walkBeforeSeconds: number;
  firstTransitLeg: RouteLeg | null;
  scheduledDepartureMs: number;
}

interface StoredReminder {
  notifyAt: number;
  routeKey?: string;
  lastDelaySeconds?: number | null;
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
const SW_READY_TIMEOUT_MS = 8_000;

function getPermissionBlockedMessage() {
  return "Notifications are blocked for this site. Enable them in browser settings and try again.";
}

function isAppleMobileDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandaloneApp() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getPushSupportStatus(): ReminderStatusMessage | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  if (!window.isSecureContext) {
    return {
      tone: "error",
      message: "Notifications require a secure HTTPS connection.",
    };
  }
  if (!("Notification" in window)) {
    return {
      tone: "error",
      message: "This browser does not support notifications.",
    };
  }
  if (!("serviceWorker" in navigator)) {
    return {
      tone: "error",
      message: "This browser does not support service workers, so push reminders cannot work.",
    };
  }
  if (!("PushManager" in window)) {
    return {
      tone: "error",
      message: "This browser mode does not support web push notifications.",
    };
  }
  if (isAppleMobileDevice() && !isStandaloneApp()) {
    return {
      tone: "warning",
      message: "On iPhone and iPad, install the app to the Home Screen and open it from there to enable notifications.",
    };
  }
  return null;
}

function formatTime(dateMs: number) {
  return new Date(dateMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDelayLabel(delaySeconds: number | null | undefined) {
  if (delaySeconds == null) return "no real-time data";
  const mins = Math.round(Math.abs(delaySeconds) / 60);
  if (mins <= 0) return "on time";
  return delaySeconds > 0 ? `${mins} min late` : `${mins} min early`;
}

function getKnownDelaySeconds(delay: { estimatedDelaySeconds: number; status: string } | null | undefined) {
  if (!delay || delay.status === "unknown") return null;
  return delay.estimatedDelaySeconds;
}

function getReminderBaseInfo(route: PlannedRoute) {
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
    firstTransitDep.getTime() - walkBeforeSeconds * 1000 - SAFETY_BUFFER_SECONDS * 1000;

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

function computeNotifyAtMs(baseInfo: ReminderBaseInfo, delaySeconds: number) {
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
  delaySeconds: number | null,
) {
  const line = baseInfo.lineNumber || "Transit";
  const leaveAt = formatTime(notifyAtMs);
  const depTime = formatTime(baseInfo.scheduledDepartureMs + (delaySeconds ?? 0) * 1000);
  const stopText = baseInfo.departureStop || "your stop";
  const walkText = baseInfo.walkMinutes > 0 ? `${baseInfo.walkMinutes} min walk` : "Head there";

  return {
    title: `Leave ${leaveAt} · Line ${line}`,
    body: `${stopText} | ${walkText} | dep ${depTime} (${formatDelayLabel(delaySeconds)})`,
  };
}

function buildDelayUpdateText(
  baseInfo: ReminderBaseInfo,
  notifyAtMs: number,
  delaySeconds: number | null,
) {
  const line = baseInfo.lineNumber || "Transit";
  return {
    title: `Update · Line ${line} ${formatDelayLabel(delaySeconds)}`,
    body: `New leave time ${formatTime(notifyAtMs)} from ${baseInfo.departureStop || "your stop"}`,
  };
}

async function schedulePushAsync(
  subscription: PushSubscription,
  notifyAt: number,
  title: string,
  body: string,
  jobKey: string,
  jobPrefix = jobKey,
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
      jobKey,
      jobPrefix,
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

function loadStoredReminder() {
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

function hasFreshRouteSnapshot() {
  try {
    const raw = localStorage.getItem(ROUTE_SNAPSHOT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredRouteSnapshot;
    return Date.now() - parsed.savedAt <= SNAPSHOT_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    bytes[i] = rawData.charCodeAt(i);
  }
  return bytes;
}

async function getPushSubscriptionAsync() {
  const supportStatus = getPushSupportStatus();
  if (supportStatus) {
    return {
      subscription: null,
      error: supportStatus.message,
    };
  }

  try {
    const existingReg = await navigator.serviceWorker.getRegistration();
    const reg =
      existingReg ??
      (await navigator.serviceWorker.register("/sw.js").catch(() => {
        throw new Error("service-worker-register-failed");
      }));
    void reg.update().catch(() => {});

    const readyReg = await Promise.race<ServiceWorkerRegistration>([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration>((_, reject) => {
        window.setTimeout(() => reject(new Error("service-worker-ready-timeout")), SW_READY_TIMEOUT_MS);
      }),
    ]);

    const activeReg = readyReg ?? reg;
    const existing = await activeReg.pushManager.getSubscription();
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

    const applicationServerKey = urlBase64ToUint8Array(pubKey);
    const permissionState =
      typeof activeReg.pushManager.permissionState === "function"
        ? await activeReg.pushManager
            .permissionState({
              userVisibleOnly: true,
              applicationServerKey,
            })
            .catch(() => null)
        : null;

    if (permissionState === "denied") {
      return {
        subscription: null,
        error: getPermissionBlockedMessage(),
      };
    }

    const subscription = await activeReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
    return { subscription, error: null };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "service-worker-ready-timeout") {
        return {
          subscription: null,
          error: "Push setup timed out before the service worker became ready. Try again in a moment.",
        };
      }
      if (error.name === "NotAllowedError") {
        return {
          subscription: null,
          error: getPermissionBlockedMessage(),
        };
      }
      if (error.name === "NotSupportedError" && isAppleMobileDevice() && !isStandaloneApp()) {
        return {
          subscription: null,
          error:
            "Push is only available on iPhone and iPad after installing the app to the Home Screen and opening it from there.",
        };
      }
    }
    return {
      subscription: null,
      error:
        "Could not enable push notifications. Private/incognito mode or device browser settings may be blocking them.",
    };
  }
}

export function useLeaveReminder(route: PlannedRoute | null) {
  const [isSet, setIsSet] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [minutesUntil, setMinutesUntil] = useState<number | null>(null);
  const [notifyAtMs, setNotifyAtMs] = useState<number | null>(null);
  const [isLiveAdjusted, setIsLiveAdjusted] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [supportStatus, setSupportStatus] = useState<ReminderStatusMessage | null>(null);

  const baseInfo = useMemo(() => (route ? getReminderBaseInfo(route) : null), [route]);

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
    if (typeof window === "undefined") return;

    const syncPermissionState = () => {
      setSupportStatus(getPushSupportStatus());
      if ("Notification" in window) {
        setPermission(Notification.permission);
      }
    };

    syncPermissionState();
    window.addEventListener("focus", syncPermissionState);
    document.addEventListener("visibilitychange", syncPermissionState);

    return () => {
      window.removeEventListener("focus", syncPermissionState);
      document.removeEventListener("visibilitychange", syncPermissionState);
    };
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      const stored = loadStoredReminder();
      if (hasMatchingRoute(stored, routeKey)) {
        setIsSet(true);
        setNotifyAtMs(stored.notifyAt);
        if (baseInfo) {
          setIsLiveAdjusted(
            Math.abs(stored.notifyAt - baseInfo.baseLeaveTimeMs) >= RESCHEDULE_THRESHOLD_MS,
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
    const targetMs = isSet ? (notifyAtMs ?? null) : (baseInfo?.baseLeaveTimeMs ?? null);
    if (!targetMs) {
      Promise.resolve().then(() => setMinutesUntil(null));
      return;
    }
    const update = () => setMinutesUntil(Math.round((targetMs - Date.now()) / 60_000));
    update();
    const tick = setInterval(update, 30_000);
    return () => clearInterval(tick);
  }, [isSet, notifyAtMs, baseInfo?.baseLeaveTimeMs]);

  const scheduleReminder = useCallback(async () => {
    if (!route || !baseInfo || typeof window === "undefined" || !("Notification" in window)) return;

    try {
      setLastError(null);

      const currentSupportStatus = getPushSupportStatus();
      setSupportStatus(currentSupportStatus);
      if (currentSupportStatus) {
        setLastError(currentSupportStatus.message);
        return;
      }

      let perm = permission;
      if (perm === "default") {
        perm = await Notification.requestPermission();
        setPermission(perm);
      }
      if (perm !== "granted") {
        setLastError(getPermissionBlockedMessage());
        return;
      }

      const { subscription: sub, error } = await getPushSubscriptionAsync();
      if (!sub) {
        setLastError(error ?? "Unable to create push subscription.");
        return;
      }

      let delaySeconds: number | null = null;
      if (baseInfo.firstTransitLeg) {
        const liveDelay = await fetchLegDelayAsync(baseInfo.firstTransitLeg);
        delaySeconds = getKnownDelaySeconds(liveDelay);
      }

      let nextNotifyAt = computeNotifyAtMs(baseInfo, delaySeconds ?? 0);
      if (nextNotifyAt < Date.now() + 5_000) nextNotifyAt = Date.now() + 5_000;

      const reminderText = buildLeaveReminderText(baseInfo, nextNotifyAt, delaySeconds);
      await schedulePushAsync(
        sub,
        nextNotifyAt,
        reminderText.title,
        reminderText.body,
        "leave-main",
        "leave-main",
      );

      saveReminder({
        notifyAt: nextNotifyAt,
        routeKey,
        lastDelaySeconds: delaySeconds,
        lastDelayPushAt: 0,
      });
      saveRouteSnapshot(route);

      setIsSet(true);
      setNotifyAtMs(nextNotifyAt);
      setIsLiveAdjusted(
        Math.abs(nextNotifyAt - baseInfo.baseLeaveTimeMs) >= RESCHEDULE_THRESHOLD_MS,
      );
      setLastError(null);
    } catch {
      setLastError("Failed to schedule reminder. Please try again.");
    }
  }, [route, baseInfo, permission, routeKey]);

  const reminderStatus = useMemo<ReminderStatusMessage | null>(() => {
    if (lastError) {
      return {
        tone: "error",
        message: lastError,
      };
    }
    if (isSet) return null;
    if (supportStatus) return supportStatus;
    if (permission === "denied") {
      return {
        tone: "error",
        message: getPermissionBlockedMessage(),
      };
    }
    if (permission === "default") {
      return {
        tone: "info",
        message: "We will ask for notification permission when you tap this.",
      };
    }
    return null;
  }, [isSet, lastError, permission, supportStatus]);

  // Adaptive mode: keep one main reminder updated and only push delay updates sparingly.
  useEffect(() => {
    if (!isSet || !baseInfo || !baseInfo.firstTransitLeg) return;

    let cancelled = false;

    const runAsync = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub || cancelled) return;

        const stored = loadStoredReminder();
        if (!hasMatchingRoute(stored, routeKey)) return;

        const liveDelay = await fetchLegDelayAsync(baseInfo.firstTransitLeg!);
        if (cancelled) return;

        const delaySeconds = getKnownDelaySeconds(liveDelay);
        let nextNotifyAt = computeNotifyAtMs(baseInfo, delaySeconds ?? 0);
        if (nextNotifyAt < Date.now() + 5_000) nextNotifyAt = Date.now() + 5_000;

        const prevNotifyAt = stored.notifyAt;
        const needsReschedule = Math.abs(nextNotifyAt - prevNotifyAt) >= RESCHEDULE_THRESHOLD_MS;

        if (needsReschedule) {
          const text = buildLeaveReminderText(baseInfo, nextNotifyAt, delaySeconds);
          await schedulePushAsync(sub, nextNotifyAt, text.title, text.body, "leave-main", "leave-main");
          if (cancelled) return;
          setNotifyAtMs(nextNotifyAt);
        }

        const prevDelaySeconds = stored.lastDelaySeconds ?? null;
        const delayChangedBy =
          delaySeconds == null || prevDelaySeconds == null
            ? 0
            : Math.abs(delaySeconds - prevDelaySeconds);
        const cooldownPassed =
          Date.now() - (stored.lastDelayPushAt ?? 0) >= DELAY_NOTIFY_COOLDOWN_MS;
        const isBeforeReminder = nextNotifyAt > Date.now() + 60_000;

        let lastDelayPushAt = stored.lastDelayPushAt ?? 0;
        if (delayChangedBy >= DELAY_NOTIFY_THRESHOLD_S && cooldownPassed && isBeforeReminder) {
          const delayText = buildDelayUpdateText(baseInfo, nextNotifyAt, delaySeconds);
          await schedulePushAsync(
            sub,
            Date.now() + 1_000,
            delayText.title,
            delayText.body,
            `delay-update-${Date.now()}`,
            "delay-update-",
          );
          if (cancelled) return;
          lastDelayPushAt = Date.now();
        }

        saveReminder({
          ...stored,
          notifyAt: nextNotifyAt,
          routeKey,
          lastDelaySeconds: delaySeconds,
          lastDelayPushAt,
        });

        setIsLiveAdjusted(
          Math.abs(nextNotifyAt - baseInfo.baseLeaveTimeMs) >= RESCHEDULE_THRESHOLD_MS,
        );
      } catch {
        // Ignore transient failures.
      }
    };

    runAsync();
    const timer = setInterval(runAsync, ADAPTIVE_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) runAsync();
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
            subscription: sub.toJSON(),
            jobPrefix: "delay-update-",
          }),
        });
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            jobPrefix: "leave-main",
          }),
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
    reminderStatus,
    scheduleReminder,
    clearReminder,
  };
}
