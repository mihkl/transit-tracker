"use server";

import { headers } from "next/headers";
import { searchPlacesAsync as searchPlacesAsync } from "@/server/google-routes";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIdentifier } from "@/lib/request-client";
import { placesQuerySchema } from "@/lib/schemas";

export async function searchPlacesActionAsync(q: string) {
  const parsedQuery = placesQuerySchema.safeParse(q);
  if (!parsedQuery.success) return [];

  const ip = getClientIdentifier(await headers());
  if (!checkRateLimit(`searchPlaces:${ip}`, 60, 60_000)) {
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
