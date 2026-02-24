"use server";

import { headers } from "next/headers";
import { searchPlaces as googleSearchPlaces } from "@/server/google-routes";
import type { PlaceSearchResult } from "@/lib/types";
import { checkRateLimit } from "@/lib/rate-limit";

export async function searchPlacesAction(q: string): Promise<PlaceSearchResult[]> {
  if (!q.trim() || q.length < 2) return [];

  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",").at(-1)?.trim() ?? "unknown";
  if (!checkRateLimit(`searchPlaces:${ip}`, 60, 60_000)) {
    return [];
  }

  const raw = await googleSearchPlaces(q);
  const seen = new Set<string>();
  return raw.filter((r) => {
    const key = `${r.name}|${r.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
