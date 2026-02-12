import { NextResponse } from "next/server";
import { transitState } from "@/lib/server/transit-state";

export const dynamic = "force-dynamic";

export async function GET() {
  await transitState.initialize();
  const shapes = transitState.getShapes();
  return NextResponse.json(shapes ?? {});
}
