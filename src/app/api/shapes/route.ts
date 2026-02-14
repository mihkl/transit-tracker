import { NextResponse } from "next/server";
import { transitState } from "@/lib/server/transit-state";

export const dynamic = "force-dynamic";

let cachedResponse: Record<string, number[][]> | null = null;

export async function GET() {
  if (cachedResponse) {
    return NextResponse.json(cachedResponse);
  }

  await transitState.initialize();
  const shapes = transitState.getShapes();
  cachedResponse = shapes ?? {};
  return NextResponse.json(cachedResponse);
}
