import type { GpsReading } from "@/lib/types";
import { captureExpectedMessage, captureUnexpectedError } from "@/lib/monitoring";
import { z } from "zod";
import { fetchWithTimeoutAsync } from "./fetch-with-timeout";

const GPS_URL = "https://gis.ee/tallinn/gps.php";
const GPS_FAILURE_REPORT_THRESHOLD = 3;

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

type GpsPollSuccess = {
  ok: true;
  readings: GpsReading[];
};

type GpsPollFailure = {
  ok: false;
  message: string;
  extra: Record<string, unknown>;
};

type GpsPollResult = GpsPollSuccess | GpsPollFailure;

function logGpsWarning(message: string, extra: Record<string, unknown>) {
  console.warn(message, extra);
}

async function pollGpsAsync(): Promise<GpsPollResult> {
  const now = new Date();

  const url = `${GPS_URL}?ver=${Date.now()}`;
  const res = await fetchWithTimeoutAsync(url);
  const rawText = await res.text();
  const trimmedBody = rawText.trim();

  if (!trimmedBody) {
    return {
      ok: false,
      message: "GPS response body was empty",
      extra: {
        status: res.status,
        contentType: res.headers.get("content-type"),
      },
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(trimmedBody);
  } catch (error) {
    return {
      ok: false,
      message: "GPS response JSON parse error",
      extra: {
        status: res.status,
        contentType: res.headers.get("content-type"),
        bodyLength: rawText.length,
        bodyPreview: trimmedBody.slice(0, 400),
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const parsed = geoJsonEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: "GPS response validation error",
      extra: { issue: parsed.error.issues[0]?.message ?? parsed.error.message },
    };
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

  return {
    ok: true,
    readings: validFeatures.map((feature) => {
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
    }),
  };
}

export class GpsPollerService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onData: (readings: GpsReading[]) => void;
  private intervalMs: number;
  private isPolling = false;
  private consecutiveFailureCount = 0;
  private outageReported = false;

  constructor(onData: (readings: GpsReading[]) => void, intervalMs = 6_000) {
    this.onData = onData;
    this.intervalMs = intervalMs;
  }

  start() {
    if (this.intervalId) return;

    this.pollAsync();

    this.intervalId = setInterval(() => this.pollAsync(), this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getDebugSnapshot() {
    return {
      intervalMs: this.intervalMs,
      running: this.intervalId !== null,
      isPolling: this.isPolling,
      consecutiveFailureCount: this.consecutiveFailureCount,
      outageReported: this.outageReported,
    };
  }

  private async pollAsync() {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      const result = await pollGpsAsync();
      if (!result.ok) {
        this.handleExpectedFailure(result.message, result.extra);
        return;
      }

      this.consecutiveFailureCount = 0;
      this.outageReported = false;
      this.onData(result.readings);
    } catch (err) {
      captureUnexpectedError(err, { area: "gps" });
    } finally {
      this.isPolling = false;
    }
  }

  private handleExpectedFailure(message: string, extra: Record<string, unknown>) {
    this.consecutiveFailureCount += 1;
    logGpsWarning(message, {
      ...extra,
      consecutiveFailures: this.consecutiveFailureCount,
    });

    if (
      this.consecutiveFailureCount < GPS_FAILURE_REPORT_THRESHOLD ||
      this.outageReported
    ) {
      return;
    }

    this.outageReported = true;
    captureExpectedMessage("GPS feed is unstable", {
      area: "gps",
      extra: {
        consecutiveFailures: this.consecutiveFailureCount,
        threshold: GPS_FAILURE_REPORT_THRESHOLD,
        lastFailureMessage: message,
        lastFailure: extra,
      },
      fingerprint: ["gps-feed-unstable"],
    });
  }
}
