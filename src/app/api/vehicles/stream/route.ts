import { NextRequest } from "next/server";
import { transitState } from "@/lib/server/transit-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await transitState.initialize();

  const { searchParams } = request.nextUrl;
  const line = searchParams.get("line") || undefined;
  const type = searchParams.get("type") || undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        try {
          const vehicles = transitState.getVehicles(line, type);
          const data = JSON.stringify({
            vehicles,
            count: vehicles.length,
            timestamp: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch (err) {
          console.error("SSE send error:", err);
        }
      };

      // Send immediately
      send();

      // Then every 5 seconds
      const interval = setInterval(send, 5000);

      // Clean up when client disconnects
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
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
