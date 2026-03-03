"use server";

import { headers } from "next/headers";
import { searchPlacesAsync as searchPlacesAsync } from "@/server/google-routes";
import { checkRateLimit } from "@/lib/rate-limit";

export async function searchPlacesActionAsync(q: string) {
  if (!q.trim() || q.length < 2) return [];

  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",").at(-1)?.trim() ?? "unknown";
  if (!checkRateLimit(`searchPlaces:${ip}`, 60, 60_000)) {
    return [];
  }

  const raw = await searchPlacesAsync(q);
  const seen = new Set<string>();
  return raw.filter((r) => {
    const key = `${r.name}|${r.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
