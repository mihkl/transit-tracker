"use client";

import { useEffect } from "react";
import { captureUnexpectedError } from "@/lib/monitoring";
import { ErrorFallback } from "@/components/error-fallback";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureUnexpectedError(error, {
      area: "app",
      extra: { digest: error.digest, boundary: "global-error" },
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorFallback />
      </body>
    </html>
  );
}
