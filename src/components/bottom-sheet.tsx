"use client";

import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  return (
    <div className="md:hidden">
      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-1000 bg-background rounded-t-2xl shadow-lg transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Content */}
        <div className="px-4 pb-6 pt-1 max-h-[60vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
