"use client";

import { useEffect } from "react";
import { getBrowserClientId } from "@/lib/browser-client-id";
import { setMonitoringUser } from "@/lib/monitoring";

export function SentryUserContext() {
  useEffect(() => {
    const clientId = getBrowserClientId();
    if (!clientId) return;
    setMonitoringUser(clientId);
  }, []);

  return null;
}
