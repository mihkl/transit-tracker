import { NextRequest } from "next/server";
import { transitState } from "@/server/transit-state";
import { vehicleStreamEventSchema } from "@/lib/schemas";
import { captureUnexpectedError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await transitState.initializeAsync();

  const encoder = new TextEncoder();
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let closeController: (() => void) | null = null;
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    unsubscribe?.();
    unsubscribe = null;

    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }

    closeController?.();
    closeController = null;
  };

  const stream = new ReadableStream({
    start(controller) {
      let lastHash = "";
      closeController = () => {
        try {
          controller.close();
        } catch {
          return;
        }
      };

      const send = () => {
        try {
          const vehicles = transitState.getVehicles();

          const hash = vehicles
            .map(
              (v) =>
                `${v.id}:${v.latitude.toFixed(5)}:${v.longitude.toFixed(5)}:${v.bearing.toFixed(0)}`,
            )
            .join("|");

          if (hash === lastHash) {
            return;
          }
          lastHash = hash;

          const payload = {
            vehicles,
            count: vehicles.length,
            timestamp: new Date().toISOString(),
          };
          const parsed = vehicleStreamEventSchema.safeParse(payload);
          if (!parsed.success) {
            return;
          }
          const data = JSON.stringify(parsed.data);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch (err) {
          captureUnexpectedError(err, {
            area: "vehicles-stream",
            extra: { phase: "send" },
          });
        }
      };

      send();

      unsubscribe = transitState.onUpdate(send);

      keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          cleanup();
        }
      }, 30000);

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
