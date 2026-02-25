import type { GpsReading } from "@/lib/types";
import { z } from "zod";
import { fetchWithTimeout } from "./fetch-with-timeout";

const GPS_URL = "https://gis.ee/tallinn/gps.php";

const geoJsonEnvelopeSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.unknown()),
});

const geoJsonFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z
      .tuple([z.coerce.number(), z.coerce.number()])
      .refine(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)),
  }),
  properties: z.object({
    id: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .refine((v) => v.length > 0, "Vehicle id is empty"),
    line: z.union([z.string(), z.number()]),
    type: z.coerce.number().refine((n) => Number.isFinite(n)),
    direction: z.coerce.number().refine((n) => Number.isFinite(n)),
    destination: z.string().catch(""),
  }),
});

export async function pollGps(): Promise<GpsReading[]> {
  const readings: GpsReading[] = [];
  const now = new Date();

  const url = `${GPS_URL}?ver=${Date.now()}`;
  const res = await fetchWithTimeout(url);
  const raw = await res.json();
  const parsed = geoJsonEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("GPS response validation error:", parsed.error.issues[0]?.message ?? parsed.error.message);
    return [];
  }
  const data = parsed.data;

  let invalidCount = 0;
  const invalidDetails: string[] = [];
  const validFeatures = data.features.flatMap((feature) => {
    const parsedFeature = geoJsonFeatureSchema.safeParse(feature);
    if (!parsedFeature.success) {
      invalidCount += 1;
      if (invalidDetails.length < 5) {
        const issues = parsedFeature.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ");
        const sample =
          typeof feature === "object" && feature !== null
            ? JSON.stringify(feature).slice(0, 400)
            : String(feature).slice(0, 400);
        invalidDetails.push(
          `feature[${invalidCount}] invalid -> ${issues} | sample=${sample}`,
        );
      }
      return [];
    }
    return [parsedFeature.data];
  });
  if (invalidCount > 0) {
    console.warn(`GPS feed: skipped ${invalidCount} invalid feature(s)`);
    for (const detail of invalidDetails) {
      console.warn(`GPS feed detail: ${detail}`);
    }
    if (invalidCount > invalidDetails.length) {
      console.warn(
        `GPS feed detail: ${invalidCount - invalidDetails.length} additional invalid feature(s) omitted`,
      );
    }
  }

  for (const feature of validFeatures) {
    try {
      const { properties, geometry } = feature;
      const [lng, lat] = geometry.coordinates;

      const reading: GpsReading = {
        transportType: properties.type,
        lineNumber: String(properties.line),
        longitude: lng,
        latitude: lat,
        speed: null,
        heading: properties.direction,
        id: properties.id,
        destination: properties.destination || "",
        timestamp: now,
      };

      readings.push(reading);
    } catch {
      continue;
    }
  }

  return readings;
}

export class GpsPollerService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onData: (readings: GpsReading[]) => void;
  private intervalMs: number;
  private isPolling = false;

  constructor(onData: (readings: GpsReading[]) => void, intervalMs = 6_000) {
    this.onData = onData;
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.intervalId) return;

    this.poll();

    this.intervalId = setInterval(() => this.poll(), this.intervalMs);
    console.log(`GPS poller started (every ${this.intervalMs / 1000}s)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("GPS poller stopped");
    }
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      const readings = await pollGps();
      this.onData(readings);
    } catch (err) {
      console.error("GPS poll error:", err instanceof Error ? err.message : err);
    } finally {
      this.isPolling = false;
    }
  }
}
