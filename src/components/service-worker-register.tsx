"use client";

import { useEffect } from "react";
import { captureUnexpectedError } from "@/lib/monitoring";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await registration.update().catch(() => undefined);
      } catch (error) {
        captureUnexpectedError(error, { area: "service-worker" });
      }
    })();

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}
