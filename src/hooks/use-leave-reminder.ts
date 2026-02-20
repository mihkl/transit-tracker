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

interface TransitLegInfo {
  leg: RouteLeg;
  depMs: number;
  arrMs: number;
  line: string;
  depStop: string;
  transferWalkSeconds: number;
}

const STORAGE_KEY = "transit-leave-reminder";
const ROUTE_SNAPSHOT_KEY = "transit-reminder-route-snapshot";
const SAFETY_BUFFER_SECONDS = 2 * 60;
const UPDATE_STEP_MS = 60_000;
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

interface PushScheduleOptions {
  jobKey: string;
  url: string;
  tag: string;
  endpoint: string;
  jobPrefix: string;
  complete?: boolean;
  category?: string;
}

async function schedulePush(
  subscription: PushSubscription,
  notifyAt: number,
  title: string,
  body: string,
  options: PushScheduleOptions,
) {
  await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      notifyAt,
      title,
      body,
      tag: options.tag,
      url: options.url,
      timestamp: notifyAt,
      category: options.category ?? "leave-reminder",
      endpoint: options.endpoint,
      jobPrefix: options.jobPrefix,
      jobKey: options.jobKey,
      complete: options.complete ?? false,
    }),
  });
}

function buildTransitLegInfos(route: PlannedRoute): TransitLegInfo[] {
  const infos: TransitLegInfo[] = [];
  let prevTransitLegIndex = -1;

  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i];
    if (leg.mode === "WALK") continue;
    if (!leg.scheduledDeparture || !leg.scheduledArrival) continue;

    let transferWalkSeconds = 0;
    if (prevTransitLegIndex >= 0) {
      for (let j = prevTransitLegIndex + 1; j < i; j++) {
        if (route.legs[j].mode === "WALK") {
          transferWalkSeconds += parseDurationSeconds(route.legs[j].duration);
        }
      }
    }

    infos.push({
      leg,
      depMs: new Date(leg.scheduledDeparture).getTime(),
      arrMs: new Date(leg.scheduledArrival).getTime(),
      line: leg.lineNumber || leg.mode,
      depStop: leg.departureStop || "stop",
      transferWalkSeconds,
    });

    prevTransitLegIndex = i;
  }

  return infos;
}

function buildLiveCardText(
  atMs: number,
  transitLegs: TransitLegInfo[],
  walkBeforeSeconds: number,
): { title: string; body: string; complete: boolean } {
  const nextIndex = transitLegs.findIndex((leg) => leg.depMs > atMs);
  if (nextIndex < 0) {
    return {
      title: "Trip complete",
      body: "Only walking remains.",
      complete: true,
    };
  }

  const nextLeg = transitLegs[nextIndex];
  const minutes = Math.max(0, Math.ceil((nextLeg.depMs - atMs) / 60_000));

  if (nextIndex === 0) {
    const walkMins = Math.max(0, Math.round(walkBeforeSeconds / 60));
    const title =
      minutes <= 0
        ? `Leave now · Line ${nextLeg.line}`
        : `Leave in ${minutes} min · Line ${nextLeg.line}`;
    const body = `${nextLeg.depStop} | ${walkMins} min walk | dep ${formatTime(nextLeg.depMs)}`;
    return { title, body, complete: false };
  }

  const prevLeg = transitLegs[nextIndex - 1];
  const transferWalkMins = Math.max(
    0,
    Math.round(nextLeg.transferWalkSeconds / 60),
  );
  const title =
    minutes <= 0
      ? `Transfer now · Line ${nextLeg.line}`
      : `Transfer in ${minutes} min · Line ${nextLeg.line}`;
  const body = `${nextLeg.depStop} | from ${prevLeg.line} | ${transferWalkMins} min walk`;
  return { title, body, complete: false };
}

async function scheduleLiveTripMonitor(
  subscription: PushSubscription,
  route: PlannedRoute,
  baseInfo: ReminderBaseInfo,
  initialDelaySeconds: number,
  endpoint: string,
  jobPrefix: string,
) {
  const transitLegs = buildTransitLegInfos(route);
  if (transitLegs.length === 0) return;

  const monitorTag = `live-trip-${jobPrefix}`;
  const now = Date.now();
  const endMs = transitLegs[transitLegs.length - 1].arrMs;
  const startMs = now;

  let seq = 0;
  for (let ts = startMs; ts <= endMs; ts += UPDATE_STEP_MS) {
    const text = buildLiveCardText(ts, transitLegs, baseInfo.walkBeforeSeconds);
    const title = text.title;
    const body =
      seq === 0
        ? `${text.body} | ${formatDelayLabel(initialDelaySeconds)}`
        : text.body;

    await schedulePush(subscription, ts + 1_000, title, body, {
      endpoint,
      jobPrefix,
      jobKey: `${jobPrefix}${seq}`,
      tag: monitorTag,
      url: "/?trip=1",
      category: "leave-reminder",
    });
    seq++;
  }

  await schedulePush(subscription, endMs + 15_000, "Trip complete", "", {
    endpoint,
    jobPrefix,
    jobKey: `${jobPrefix}complete`,
    tag: monitorTag,
    url: "/?trip=1",
    category: "leave-reminder",
    complete: true,
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
  jobPrefix?: string;
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
    if (data.notifyAt > Date.now() - 30 * 60_000) return data;
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
    Promise.resolve().then(() => {
      const stored = loadStoredReminder();
      if (stored) {
        setIsSet(true);
        setNotifyAtMs(stored.notifyAt);
      }
    });
  }, []);

  // Countdown timer (for first departure card in planner)
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
      !route ||
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

    // Clear older scheduled notifications for this subscription first.
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });

    const liveDelay =
      baseInfo.firstTransitLeg != null
        ? await fetchLegDelay(baseInfo.firstTransitLeg)
        : null;
    const delaySeconds = liveDelay?.estimatedDelaySeconds ?? 0;
    const firstNotifyAt = computeNotifyAtMs(baseInfo, delaySeconds);
    const jobPrefix = `trip-${Date.now()}-`;

    await scheduleLiveTripMonitor(
      sub,
      route,
      baseInfo,
      delaySeconds,
      sub.endpoint,
      jobPrefix,
    );

    saveReminder({
      endpoint: sub.endpoint,
      notifyAt: firstNotifyAt,
      routeKey,
      jobPrefix,
    });
    saveRouteSnapshot(route);

    setIsSet(true);
    setNotifyAtMs(firstNotifyAt);
    setIsLiveAdjusted(
      Math.abs(firstNotifyAt - baseInfo.baseLeaveTimeMs) >= 60_000,
    );
  }, [route, baseInfo, permission, routeKey]);

  const clearReminder = useCallback(async () => {
    const stored = loadStoredReminder();
    clearStoredReminder();
    if (!hasFreshRouteSnapshot()) {
      clearRouteSnapshot();
    }

    setIsSet(false);
    setNotifyAtMs(null);
    setIsLiveAdjusted(false);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            jobPrefix: stored?.jobPrefix,
          }),
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
