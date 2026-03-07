"use client";

import { useMemo } from "react";
import type { PlannedRoute, RouteLeg } from "@/lib/types";
import { useLeaveReminder, type ReminderStatusMessage } from "@/hooks/use-leave-reminder";
import { useTransferViability, type TransferInfo } from "@/hooks/use-transfer-viability";

export interface RouteReminderState {
  isSet: boolean;
  minutesUntil: number | null;
  isLiveAdjusted: boolean;
  error: string | null;
  status: ReminderStatusMessage | null;
  onSchedule: () => void;
  onClear: () => void;
}

export function useRoutePlannerInsights(selectedRoute: PlannedRoute | null) {
  const transfers = useTransferViability(selectedRoute);
  const transfersByArrivingLeg = useMemo<Map<RouteLeg, TransferInfo>>(
    () => new Map(transfers.map((transfer) => [transfer.arrivingLeg, transfer])),
    [transfers],
  );

  const {
    leaveInfo,
    isSet,
    isLiveAdjusted,
    minutesUntil,
    lastError,
    reminderStatus,
    scheduleReminder,
    clearReminder,
  } = useLeaveReminder(selectedRoute);

  const reminderProps: RouteReminderState | undefined = leaveInfo
    ? {
        isSet,
        minutesUntil,
        isLiveAdjusted,
        error: lastError,
        status: reminderStatus,
        onSchedule: scheduleReminder,
        onClear: clearReminder,
      }
    : undefined;

  return {
    transfersByArrivingLeg,
    reminderProps,
    isLiveAdjusted,
    minutesUntil,
  };
}
