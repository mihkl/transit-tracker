"use client";

import { useMemo } from "react";
import type { PlannedRoute, RouteLeg } from "@/lib/types";
import { useLeaveReminder, type ReminderStatusMessage } from "@/hooks/use-leave-reminder";
import { useTransferViability, type TransferInfo } from "@/hooks/use-transfer-viability";

interface RouteReminderState {
  isSet: boolean;
  scheduling: boolean;
  minutesUntil: number | null;
  error: string | null;
  status: ReminderStatusMessage | null;
  onSchedule: () => void;
  onClear: () => void;
}

export function useRoutePlannerInsights(selectedRoute: PlannedRoute | null) {
  const { transfers, liveDelays } = useTransferViability(selectedRoute);

  const liveRoute = useMemo<PlannedRoute | null>(() => {
    if (!selectedRoute) return null;

    let hasLiveOverrides = false;
    const legs = selectedRoute.legs.map((leg) => {
      if (!liveDelays.has(leg)) return leg;
      hasLiveOverrides = true;
      const liveDelay = liveDelays.get(leg) ?? undefined;
      return {
        ...leg,
        delay: liveDelay,
      };
    });

    return hasLiveOverrides ? { ...selectedRoute, legs } : selectedRoute;
  }, [selectedRoute, liveDelays]);

  const transfersByArrivingLeg = useMemo<Map<RouteLeg, TransferInfo>>(() => {
    if (!selectedRoute || !liveRoute) return new Map();

    const clonedLegByOriginal = new Map<RouteLeg, RouteLeg>(
      selectedRoute.legs.map((leg, index) => [leg, liveRoute.legs[index] ?? leg]),
    );

    return new Map(
      transfers.map((transfer) => {
        const arrivingLeg = clonedLegByOriginal.get(transfer.arrivingLeg) ?? transfer.arrivingLeg;
        const departingLeg =
          clonedLegByOriginal.get(transfer.departingLeg) ?? transfer.departingLeg;
        return [
          arrivingLeg,
          {
            ...transfer,
            arrivingLeg,
            departingLeg,
          },
        ];
      }),
    );
  }, [selectedRoute, liveRoute, transfers]);

  const {
    leaveInfo,
    isSet,
    scheduling,
    minutesUntil,
    lastError,
    reminderStatus,
    scheduleReminder,
    clearReminder,
  } = useLeaveReminder(selectedRoute);

  const reminderProps: RouteReminderState | undefined = leaveInfo
    ? {
        isSet,
        scheduling,
        minutesUntil,
        error: lastError,
        status: reminderStatus,
        onSchedule: scheduleReminder,
        onClear: clearReminder,
      }
    : undefined;

  return {
    liveRoute,
    transfersByArrivingLeg,
    reminderProps,
    minutesUntil,
  };
}
