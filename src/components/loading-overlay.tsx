"use client";

export function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/80 pointer-events-none">
      <div className="flex flex-col items-center gap-3 animate-fade-in">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-foreground/8" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
        </div>
        <span className="text-sm font-medium text-foreground/55">
          Connecting to live feed...
        </span>
      </div>
    </div>
  );
}
