import { NextRequest, NextResponse } from "next/server";
import { searchPlaces } from "@/lib/server/google-routes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";

  if (!q.trim() || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const raw = await searchPlaces(q);

    const seen = new Set<string>();
    const results = raw.filter((r) => {
      const key = `${r.name}|${r.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Places search error:", err);
    return NextResponse.json(
      { error: `Search failed: ${err instanceof Error ? err.message : err}` },
      { status: 500 },
    );
  }
}
