"use client";

import { useEffect } from "react";
import { captureUnexpectedError } from "@/lib/monitoring";

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
      <body className="h-dvh flex flex-col items-center justify-center gap-3 bg-background p-6">
        <p className="text-sm text-foreground/50 text-center">Something went wrong</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold"
        >
          Reload
        </button>
      </body>
    </html>
  );
}
