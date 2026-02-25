"use client";

import { useCallback, useRef, useState } from "react";

interface UseDragDismissOptions {
  thresholdPx: number;
  velocityThreshold: number;
  onDismiss: () => void;
  maxStartY?: number;
  axisLockRatio?: number;
}

export function useDragDismiss({
  thresholdPx,
  velocityThreshold,
  onDismiss,
  maxStartY,
  axisLockRatio,
}: UseDragDismissOptions) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  const beginDrag = useCallback((clientY: number, clientX?: number) => {
    startYRef.current = clientY;
    startXRef.current = typeof clientX === "number" ? clientX : null;
    startTimeRef.current = performance.now();
    setIsDragging(true);
  }, []);

  const updateDrag = useCallback(
    (clientY: number, clientX?: number) => {
      const startY = startYRef.current;
      if (startY === null) return;

      if (typeof maxStartY === "number" && startY > maxStartY) return;

      const dy = clientY - startY;
      if (typeof axisLockRatio === "number") {
        const startX = startXRef.current;
        if (startX !== null && typeof clientX === "number") {
          const dx = clientX - startX;
          if (Math.abs(dy) <= Math.abs(dx) * axisLockRatio) return;
        }
      }

      setDragY(Math.max(0, dy));
    },
    [axisLockRatio, maxStartY],
  );

  const endDrag = useCallback(() => {
    if (startYRef.current === null) return;

    const elapsed = Math.max(1, performance.now() - startTimeRef.current);
    const velocity = dragY / elapsed;
    const shouldClose = dragY > thresholdPx || velocity > velocityThreshold;

    setIsDragging(false);
    startYRef.current = null;
    startXRef.current = null;
    setDragY(0);

    if (shouldClose) onDismiss();
  }, [dragY, onDismiss, thresholdPx, velocityThreshold]);

  return { dragY, isDragging, beginDrag, updateDrag, endDrag };
}
