import { NextRequest } from "next/server";
import { transitState } from "@/server/transit-state";
import { vehicleStreamEventSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await transitState.initialize();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastHash = "";

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
          console.error("SSE send error:", err);
        }
      };

      send();

      const unsubscribe = transitState.onUpdate(send);

      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, 30000);

      request.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(keepAliveInterval);
        try {
          controller.close();
        } catch {
          return;
        }
      });
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
