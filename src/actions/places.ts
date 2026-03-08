"use server";

import { headers } from "next/headers";
import { searchPlacesAsync as searchPlacesAsync } from "@/server/google-routes";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRateLimitIdentifier } from "@/lib/request-client";
import { placesQuerySchema } from "@/lib/schemas";

export async function searchPlacesActionAsync(q: string, clientId?: string) {
  const parsedQuery = placesQuerySchema.safeParse(q);
  if (!parsedQuery.success) return [];

  const requester = getRateLimitIdentifier(await headers(), clientId);
  const limit = await consumeRateLimit("places", `searchPlaces:${requester}`);
  if (!limit.ok) {
    throw new Error("Too many search requests. Please wait a moment.");
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
