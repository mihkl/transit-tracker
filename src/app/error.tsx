"use client";

import { useEffect } from "react";
import { captureUnexpectedError } from "@/lib/monitoring";
import { ErrorFallback } from "@/components/error-fallback";

export default function Error({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureUnexpectedError(error, {
      area: "app",
      extra: { digest: error.digest, boundary: "error" },
    });
  }, [error]);

  return <ErrorFallback />;
}
