"use server";

import { headers } from "next/headers";
import { searchPlacesAsync as searchPlacesAsync } from "@/server/google-routes";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientIdentifier } from "@/lib/request-client";
import { placesQuerySchema } from "@/lib/schemas";

export async function searchPlacesActionAsync(q: string) {
  const parsedQuery = placesQuerySchema.safeParse(q);
  if (!parsedQuery.success) return [];

  const ip = getClientIdentifier(await headers());
  const limit = await consumeRateLimit("places", `searchPlaces:${ip}`);
  if (!limit.ok) {
    return [];
  }

  const raw = await searchPlacesAsync(parsedQuery.data);
  const seen = new Set<string>();
  return raw.filter((r) => {
    const key = `${r.name}|${r.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
