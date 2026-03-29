"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { PlannedRoute } from "@/lib/types";
import { useTransitStore, type PlannerStop } from "@/store/use-transit-store";
import { parseDurationSeconds } from "@/lib/route-time";
import {
  PUSH_API_PATH,
  LEAVE_MAIN_JOB_KEY,
  LEAVE_REMINDER_TAG,
  LEAVE_REMINDER_CATEGORY,
} from "@/lib/push-constants";

interface LeaveInfo {
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
  scheduledDepartureMs: number;
}

interface StoredReminder {
  notifyAt: number;
  leaveAt: number;
  routeKey?: string;
}

interface StoredRouteSnapshot {
  route: PlannedRoute;
  plannerStops?: PlannerStop[];
  savedAt: number;
}

const STORAGE_KEY = "transit-leave-reminder";
const ROUTE_SNAPSHOT_KEY = "transit-reminder-route-snapshot";
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const REMINDER_EXPIRY_MS = 30 * 60 * 1000;

const PRE_NOTIFICATION_MS = 2 * 60 * 1000;
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

function getReminderBaseInfo(route: PlannedRoute) {
  let walkBeforeSeconds = 0;
  let firstTransitDep: Date | null = null;
  let lineNumber = "";
  let departureStop = "";

  for (const leg of route.legs) {
    if (leg.mode === "WALK") {
      if (!firstTransitDep) {
        walkBeforeSeconds += parseDurationSeconds(leg.duration);
      }
    } else if (!firstTransitDep && leg.scheduledDeparture) {
      firstTransitDep = new Date(leg.scheduledDeparture);
      lineNumber = leg.lineNumber ?? "";
      departureStop = leg.departureStop ?? "";
      break;
    }
  }

  if (!firstTransitDep) return null;

  const leaveMs = firstTransitDep.getTime() - walkBeforeSeconds * 1000;

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
    scheduledDepartureMs: firstTransitDep.getTime(),
  };
}

function buildLeaveReminderText(baseInfo: ReminderBaseInfo) {
  const line = baseInfo.lineNumber || "Transit";
  const leaveAt = formatTime(baseInfo.baseLeaveTimeMs);
  const stopText = baseInfo.departureStop || "your stop";
  const walkText = baseInfo.walkMinutes > 0 ? `${baseInfo.walkMinutes} min walk` : "Head there";

  return {
    title: `Leave at ${leaveAt} · Line ${line}`,
    body: `${stopText} | ${walkText} | dep ${formatTime(baseInfo.scheduledDepartureMs)}`,
  };
}

async function schedulePushAsync(
  subscription: PushSubscription,
  notifyAt: number,
  title: string,
  body: string,
) {
  const response = await fetch(PUSH_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      notifyAt,
      title,
      body,
      tag: LEAVE_REMINDER_TAG,
      url: "/?trip=1",
      timestamp: notifyAt,
      category: LEAVE_REMINDER_CATEGORY,
      jobKey: LEAVE_MAIN_JOB_KEY,
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
    if (data.leaveAt > Date.now() - REMINDER_EXPIRY_MS) return data;
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function saveRouteSnapshot(route: PlannedRoute, plannerStops?: PlannerStop[]) {
  try {
    const payload: StoredRouteSnapshot = {
      route,
      plannerStops,
      savedAt: Date.now(),
    };
    localStorage.setItem(ROUTE_SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {}
}

function loadStoredRouteSnapshot() {
  try {
    const raw = localStorage.getItem(ROUTE_SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as StoredRouteSnapshot;
    const isFresh = snapshot?.savedAt && Date.now() - snapshot.savedAt <= SNAPSHOT_MAX_AGE_MS;
    const hasLegs = Array.isArray(snapshot?.route?.legs);
    if (!isFresh || !hasLegs) {
      localStorage.removeItem(ROUTE_SNAPSHOT_KEY);
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function clearStoredReminder() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function clearRouteSnapshot() {
  try {
    localStorage.removeItem(ROUTE_SNAPSHOT_KEY);
  } catch {}
}

export function clearStoredActiveTrip() {
  clearStoredReminder();
  clearRouteSnapshot();
}

/** Buffer after the last leg's scheduled arrival before auto-expiring the trip */
const TRIP_END_BUFFER_MS = 10 * 60 * 1000;

function isTripOver(snapshot: StoredRouteSnapshot) {
  const legs = snapshot.route?.legs;
  if (!legs?.length) return false;

  for (let i = legs.length - 1; i >= 0; i--) {
    const arrival = legs[i].scheduledArrival;
    if (arrival) {
      const arrivalMs = new Date(arrival).getTime();
      if (!Number.isNaN(arrivalMs)) {
        return Date.now() > arrivalMs + TRIP_END_BUFFER_MS;
      }
    }
  }
  return false;
}

export function loadStoredActiveTrip() {
  const reminder = loadStoredReminder();
  const snapshot = loadStoredRouteSnapshot();
  if (reminder && snapshot) {
    if (isTripOver(snapshot)) {
      clearStoredActiveTrip();
      return null;
    }
    return { reminder, snapshot };
  }
  if (reminder || snapshot) {
    clearStoredActiveTrip();
  }
  return null;
}

function hasMatchingRoute(
  stored: StoredReminder | null,
  routeKey: string,
): stored is StoredReminder & { routeKey: string } {
  return !!stored && !!routeKey && stored.routeKey === routeKey;
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

    const keyResp = await fetch(PUSH_API_PATH);
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
  const [leaveAtMs, setLeaveAtMs] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [supportStatus, setSupportStatus] = useState<ReminderStatusMessage | null>(null);
  const [scheduling, setScheduling] = useState(false);

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
        leaveTime: new Date(leaveAtMs ?? baseInfo.baseLeaveTimeMs),
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
      const activeTrip = loadStoredActiveTrip();
      useTransitStore.getState().setHasActiveTrip(!!activeTrip);
      const stored = activeTrip?.reminder ?? null;
      if (hasMatchingRoute(stored, routeKey)) {
        setIsSet(true);
        setLeaveAtMs(stored.leaveAt);
      } else {
        setIsSet(false);
        setLeaveAtMs(null);
      }
    });
  }, [routeKey]);

  useEffect(() => {
    const targetMs = isSet ? leaveAtMs : baseInfo?.baseLeaveTimeMs;
    if (!targetMs) {
      Promise.resolve().then(() => setMinutesUntil(null));
      return;
    }
    const update = () => setMinutesUntil(Math.round((targetMs - Date.now()) / 60_000));
    update();
    const tick = setInterval(update, 30_000);
    return () => clearInterval(tick);
  }, [isSet, leaveAtMs, baseInfo?.baseLeaveTimeMs]);

  const scheduleReminder = useCallback(async () => {
    if (!route || !baseInfo || typeof window === "undefined" || !("Notification" in window)) return;

    try {
      setScheduling(true);
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

      const leaveAt = baseInfo.baseLeaveTimeMs;
      const notifyAt = Math.max(Date.now() + 5_000, leaveAt - PRE_NOTIFICATION_MS);
      const reminderText = buildLeaveReminderText(baseInfo);

      await schedulePushAsync(sub, notifyAt, reminderText.title, reminderText.body);

      saveReminder({
        notifyAt,
        leaveAt,
        routeKey,
      });
      const currentStops = useTransitStore.getState().plannerStops;
      saveRouteSnapshot(route, currentStops);

      setIsSet(true);
      setLeaveAtMs(leaveAt);
      setLastError(null);
      useTransitStore.getState().setHasActiveTrip(true);
    } catch {
      setLastError("Failed to schedule reminder. Please try again.");
    } finally {
      setScheduling(false);
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

  const clearReminder = useCallback(async () => {
    const activeTrip = loadStoredActiveTrip();
    const stored = activeTrip?.reminder ?? null;
    if (!hasMatchingRoute(stored, routeKey)) return;
    clearStoredActiveTrip();

    setIsSet(false);
    setLeaveAtMs(null);
    setLastError(null);
    useTransitStore.getState().setHasActiveTrip(false);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(PUSH_API_PATH, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            jobPrefix: LEAVE_MAIN_JOB_KEY,
          }),
        });
      }
    } catch {}
  }, [routeKey]);

  return {
    leaveInfo,
    isSet,
    scheduling,
    permission,
    minutesUntil,
    lastError,
    reminderStatus,
    scheduleReminder,
    clearReminder,
  };
}
