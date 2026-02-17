"use client";

export function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-1000 flex items-center justify-center bg-background/80 pointer-events-none">
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="w-5 h-5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
        Waiting for vehicle data...
      </div>
    </div>
  );
}
