"use client";

import { useEffect } from "react";

export default function Error({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="h-dvh flex flex-col items-center justify-center gap-3 bg-background p-6">
      <p className="text-sm text-foreground/50 text-center">Something went wrong</p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold"
      >
        Reload
      </button>
    </div>
  );
}
