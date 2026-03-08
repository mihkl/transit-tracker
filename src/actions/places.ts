"use server";

import { headers } from "next/headers";
import { searchPlacesAsync as searchPlacesAsync } from "@/server/google-routes";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRateLimitIdentifier } from "@/lib/request-client";
import { placesQuerySchema } from "@/lib/schemas";
import type { PlaceSearchResult } from "@/lib/types";
import { captureExpectedMessage, captureUnexpectedError } from "@/lib/monitoring";

export interface PlaceSearchActionResult {
  results: PlaceSearchResult[];
  error: string | null;
}

export async function searchPlacesActionAsync(
  q: string,
  clientId?: string,
): Promise<PlaceSearchActionResult> {
  const parsedQuery = placesQuerySchema.safeParse(q);
  if (!parsedQuery.success) {
    return { results: [], error: null };
  }

  try {
    const requester = getRateLimitIdentifier(await headers(), clientId);
    const limit = await consumeRateLimit("places", `searchPlaces:${requester}`);
    if (!limit.ok) {
      captureExpectedMessage("Places search rate limit exceeded", {
        area: "places",
        clientId,
        tags: { requester },
        extra: {
          queryLength: parsedQuery.data.length,
        },
      });
      return {
        results: [],
        error: "Too many search requests. Please wait a moment.",
      };
    }

    const raw = await searchPlacesAsync(parsedQuery.data);
    const seen = new Set<string>();
    return {
      results: raw.filter((r) => {
        const key = `${r.name}|${r.address}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
      error: null,
    };
  } catch (error) {
    captureUnexpectedError(error, {
      area: "places",
      clientId,
      extra: {
        query: parsedQuery.data,
      },
    });
    return {
      results: [],
      error: "Search failed. Check connection and try again.",
    };
  }
}
