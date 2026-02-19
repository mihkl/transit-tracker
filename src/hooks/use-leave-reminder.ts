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

  // Leave time = first transit departure - walk time - 2 min safety buffer
  const leaveMs =
    firstTransitDep.getTime() - walkBeforeSeconds * 1000 - 2 * 60 * 1000;

  // Don't show reminder if leave time is already well past
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

export function useLeaveReminder(route: PlannedRoute | null) {
  const [isSet, setIsSet] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    "default",
  );
  const [minutesUntil, setMinutesUntil] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const leaveInfo = useMemo(
    () => (route ? getLeaveInfo(route) : null),
    [route],
  );

  // Sync notification permission state
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
  }, []);

  // Update countdown every 30s
  useEffect(() => {
    if (!leaveInfo) {
      setMinutesUntil(null);
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

    if (timerRef.current) clearTimeout(timerRef.current);

    const msUntilLeave = leaveInfo.leaveTime.getTime() - Date.now();
    if (msUntilLeave < 0) return;

    const { lineNumber, depTimeStr, walkMinutes, departureStop } = leaveInfo;
    const walkText =
      walkMinutes > 0
        ? `Walk ${walkMinutes} min to ${departureStop}`
        : `Head to ${departureStop}`;

    timerRef.current = setTimeout(() => {
      new Notification("Time to leave!", {
        body: `${walkText} · ${lineNumber} departs ${depTimeStr}`,
        icon: "/icon-192x192.png",
        tag: "leave-reminder",
      });
      setIsSet(false);
    }, msUntilLeave);

    setIsSet(true);
  }, [leaveInfo, permission]);

  const clearReminder = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
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
