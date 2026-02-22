"use server";

import { searchPlaces as googleSearchPlaces } from "@/server/google-routes";
import type { PlaceSearchResult } from "@/lib/types";

export async function searchPlacesAction(q: string): Promise<PlaceSearchResult[]> {
  if (!q.trim() || q.length < 2) return [];

  const raw = await googleSearchPlaces(q);
  const seen = new Set<string>();
  return raw.filter((r) => {
    const key = `${r.name}|${r.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
