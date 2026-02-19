"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { PlannedRoute } from "@/lib/types";

export interface LeaveInfo {
  leaveTime: Date;
  walkMinutes: number;
  lineNumber: string;
  depTimeStr: string;
  departureStop: string;
}

const STORAGE_KEY = "transit-leave-reminder";

function parseDurationSeconds(duration?: string): number {
  if (!duration) return 0;
  const match = duration.match(/(\d+)s/);
  return match ? parseInt(match[1], 10) : 0;
}

function getLeaveInfo(route: PlannedRoute): LeaveInfo | null {
  let walkBeforeSeconds = 0;
  let firstTransitDep: Date | null = null;
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
        lineNumber = leg.lineNumber ?? "";
        departureStop = leg.departureStop ?? "";
        break;
      }
    }
  }

  if (!firstTransitDep) return null;

  const leaveMs =
    firstTransitDep.getTime() - walkBeforeSeconds * 1000 - 2 * 60 * 1000;

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
  };
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

  const leaveInfo = useMemo(
    () => (route ? getLeaveInfo(route) : null),
    [route],
  );

  // Sync notification permission on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    Promise.resolve().then(() => setPermission(Notification.permission));
  }, []);

  // Restore isSet from localStorage on mount
  useEffect(() => {
    async function restore() {
      const stored = loadStoredReminder();
      if (stored) setIsSet(true);
    }
    restore();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!leaveInfo) {
      Promise.resolve().then(() => setMinutesUntil(null));
      return;
    }
    const update = () =>
      setMinutesUntil(
        Math.round((leaveInfo.leaveTime.getTime() - Date.now()) / 60_000),
      );
    update();
    const tick = setInterval(update, 30_000);
    return () => clearInterval(tick);
  }, [leaveInfo]);

  // Clear isSet when route changes
  useEffect(() => {
    return () => setIsSet(false);
  }, [route]);

  const scheduleReminder = useCallback(async () => {
    if (
      !leaveInfo ||
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
    if (leaveInfo.leaveTime.getTime() < Date.now()) return;

    const sub = await getPushSubscription();
    if (!sub) return;

    const { lineNumber, depTimeStr, walkMinutes, departureStop } = leaveInfo;
    const walkText =
      walkMinutes > 0
        ? `Walk ${walkMinutes} min to ${departureStop}`
        : `Head to ${departureStop}`;

    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        notifyAt: leaveInfo.leaveTime.getTime(),
        title: "Time to leave!",
        body: `${walkText} · ${lineNumber} departs ${depTimeStr}`,
      }),
    });

    saveReminder({
      endpoint: sub.endpoint,
      notifyAt: leaveInfo.leaveTime.getTime(),
    });
    setIsSet(true);
  }, [leaveInfo, permission]);

  const clearReminder = useCallback(async () => {
    clearStoredReminder();
    setIsSet(false);
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
    permission,
    minutesUntil,
    scheduleReminder,
    clearReminder,
  };
}
