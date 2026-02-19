"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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

// --- localStorage helpers ---

interface StoredReminder {
  notifyAt: number;
  title: string;
  body: string;
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


function postToSW(message: object) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage(message);
}


export function useLeaveReminder(route: PlannedRoute | null) {
  const [isSet, setIsSet] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [minutesUntil, setMinutesUntil] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<StoredReminder | null>(null);

  const leaveInfo = useMemo(
    () => (route ? getLeaveInfo(route) : null),
    [route],
  );

  // Sync notification permission state
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    Promise.resolve().then(() => setPermission(Notification.permission));
  }, []);

  const scheduleTimer = useCallback((data: StoredReminder) => {
    const delay = data.notifyAt - Date.now();
    if (delay <= 0) return;

    postToSW({ type: "SCHEDULE_NOTIFICATION", ...data });

    if (timerRef.current) clearTimeout(timerRef.current);
    pendingRef.current = data;
    timerRef.current = setTimeout(() => {
      try {
        new Notification(data.title, {
          body: data.body,
          icon: "/icon-192x192.png",
          tag: "leave-reminder",
        });
      } catch {}
      setIsSet(false);
      clearStoredReminder();
      pendingRef.current = null;
    }, delay);
  }, []);

  useEffect(() => {
    async function recover() {
      const stored = loadStoredReminder();
      if (stored && typeof Notification !== "undefined" && Notification.permission === "granted") {
        setIsSet(true);
        scheduleTimer(stored);
      }
    }
    recover();
  }, [scheduleTimer]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden || !pendingRef.current) return;
      const { notifyAt } = pendingRef.current;
      if (notifyAt > Date.now()) {
        scheduleTimer(pendingRef.current);
      } else {
        setIsSet(false);
        clearStoredReminder();
        pendingRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [scheduleTimer]);

  // Update countdown every 30s
  useEffect(() => {
    if (!leaveInfo) {
      Promise.resolve().then(() => setMinutesUntil(null));
      return;
    }
    const update = () => {
      setMinutesUntil(
        Math.round((leaveInfo.leaveTime.getTime() - Date.now()) / 60_000),
      );
    };
    update();
    const tick = setInterval(update, 30_000);
    return () => clearInterval(tick);
  }, [leaveInfo]);

  // Cancel timer when route changes
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsSet(false);
    };
  }, [route]);

  const scheduleReminder = useCallback(async () => {
    if (!leaveInfo || typeof window === "undefined" || !("Notification" in window))
      return;

    let perm = permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
      setPermission(perm);
    }
    if (perm !== "granted") return;

    const msUntilLeave = leaveInfo.leaveTime.getTime() - Date.now();
    if (msUntilLeave < 0) return;

    const { lineNumber, depTimeStr, walkMinutes, departureStop } = leaveInfo;
    const walkText =
      walkMinutes > 0
        ? `Walk ${walkMinutes} min to ${departureStop}`
        : `Head to ${departureStop}`;
    const data: StoredReminder = {
      notifyAt: leaveInfo.leaveTime.getTime(),
      title: "Time to leave!",
      body: `${walkText} · ${lineNumber} departs ${depTimeStr}`,
    };

    scheduleTimer(data);
    saveReminder(data);
    setIsSet(true);
  }, [leaveInfo, permission, scheduleTimer]);

  const clearReminder = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    postToSW({ type: "CANCEL_NOTIFICATION" });
    clearStoredReminder();
    setIsSet(false);
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
