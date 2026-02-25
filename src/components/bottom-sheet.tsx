"use client";

import { useDragDismiss } from "@/hooks/use-drag-dismiss";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const { dragY, isDragging, beginDrag, updateDrag, endDrag } = useDragDismiss({
    thresholdPx: 120,
    velocityThreshold: 0.7,
    onDismiss: onClose,
  });

  return (
    <div className="md:hidden">
      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[1100] bg-white rounded-t-3xl shadow-sheet ${
          isDragging
            ? ""
            : "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        } ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={open ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-2 touch-none"
          onTouchStart={(e) => beginDrag(e.touches[0].clientY)}
          onTouchMove={(e) => updateDrag(e.touches[0].clientY)}
          onTouchEnd={endDrag}
          onTouchCancel={endDrag}
        >
          <div className="w-9 h-1 rounded-full bg-foreground/20" />
        </div>

        {/* Content — pb-20 clears the bottom nav bar */}
        <div className="px-5 pb-20 pt-1 max-h-[55vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
