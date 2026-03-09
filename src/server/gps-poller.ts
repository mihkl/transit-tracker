import type { GpsReading } from "@/lib/types";
import { captureExpectedMessage, captureUnexpectedError } from "@/lib/monitoring";
import { z } from "zod";
import { fetchWithTimeoutAsync } from "./fetch-with-timeout";

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

async function pollGpsAsync() {
  const now = new Date();

  const url = `${GPS_URL}?ver=${Date.now()}`;
  const res = await fetchWithTimeoutAsync(url);
  const raw = await res.json();
  const parsed = geoJsonEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    captureExpectedMessage("GPS response validation error", {
      area: "gps",
      extra: { issue: parsed.error.issues[0]?.message ?? parsed.error.message },
    });
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
    captureExpectedMessage(`GPS feed: skipped ${invalidCount} invalid feature(s)`, {
      area: "gps",
      extra: {
        invalidCount,
        invalidDetails,
        omittedCount: Math.max(0, invalidCount - invalidDetails.length),
      },
    });
  }

  return validFeatures.map((feature) => {
    const { properties, geometry } = feature;
    const [lng, lat] = geometry.coordinates;
    return {
      transportType: properties.type,
      lineNumber: String(properties.line),
      longitude: lng,
      latitude: lat,
      heading: properties.direction,
      id: properties.id,
      destination: properties.destination || "",
      timestamp: now,
    } satisfies GpsReading;
  });
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

  start() {
    if (this.intervalId) return;

    this.pollAsync();

    this.intervalId = setInterval(() => this.pollAsync(), this.intervalMs);
    console.log(`GPS poller started (every ${this.intervalMs / 1000}s)`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("GPS poller stopped");
    }
  }

  private async pollAsync() {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      const readings = await pollGpsAsync();
      this.onData(readings);
    } catch (err) {
      captureUnexpectedError(err, { area: "gps" });
    } finally {
      this.isPolling = false;
    }
  }
}
