import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

type RateLimitRequesterType = "anonymous" | "ip" | "fingerprint" | "unknown";

interface RateLimitRequester {
  requester: string;
  requesterType: RateLimitRequesterType;
}

interface RateLimitContext {
  requester: string;
  requesterType: RateLimitRequesterType;
  requesters: RateLimitRequester[];
  clientIdProvided: boolean;
  clientIdAccepted: boolean;
  anonymousIdProvided: boolean;
  anonymousIdAccepted: boolean;
}

const RATE_LIMIT_COOKIE_NAME = "transit-rate-limit-id";
const RATE_LIMIT_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;
const RATE_LIMIT_ID_PATTERN = /^[a-zA-Z0-9_-]{16,64}$/;

const DEV_COOKIE_SECRET_KEY = "__transitDevRateLimitCookieSecret__";

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    [DEV_COOKIE_SECRET_KEY]?: string;
  };
}

function getRateLimitCookieSecret() {
  if (env.RATE_LIMIT_COOKIE_SECRET) return env.RATE_LIMIT_COOKIE_SECRET;
  if (env.NODE_ENV === "production") return null;

  const scoped = getGlobalScope();
  scoped[DEV_COOKIE_SECRET_KEY] ??= randomBytes(32).toString("base64url");
  return scoped[DEV_COOKIE_SECRET_KEY];
}

function signAnonymousId(id: string, secret: string) {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

function verifySignature(id: string, signature: string, secret: string) {
  const expected = Buffer.from(signAnonymousId(id, secret), "base64url");
  const provided = Buffer.from(signature, "base64url");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function parseSignedAnonymousId(value: string | undefined, secret: string) {
  if (!value) return null;

  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex <= 0) return null;

  const id = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  if (!RATE_LIMIT_ID_PATTERN.test(id) || !signature) return null;

  try {
    return verifySignature(id, signature, secret) ? id : null;
  } catch {
    return null;
  }
}

function createSignedAnonymousId(secret: string) {
  const id = randomBytes(18).toString("base64url");
  return {
    id,
    value: `${id}.${signAnonymousId(id, secret)}`,
  };
}

async function getAnonymousRequester(): Promise<RateLimitRequester | null> {
  const secret = getRateLimitCookieSecret();
  if (!secret) return null;

  try {
    const cookieStore = await cookies();
    const existingCookie = cookieStore.get(RATE_LIMIT_COOKIE_NAME)?.value;
    const existingId = parseSignedAnonymousId(existingCookie, secret);
    if (existingId) {
      return {
        requester: `anon:${existingId}`,
        requesterType: "anonymous",
      };
    }

    const created = createSignedAnonymousId(secret);
    cookieStore.set(RATE_LIMIT_COOKIE_NAME, created.value, {
      httpOnly: true,
      maxAge: RATE_LIMIT_COOKIE_MAX_AGE_SEC,
      path: "/",
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    });

    return {
      requester: `anon:${created.id}`,
      requesterType: "anonymous",
    };
  } catch {
    return null;
  }
}

export function getClientIdentifier(requestHeaders: Headers) {
  const realIp = requestHeaders.get("x-real-ip")?.trim();

  const forwardedFor = requestHeaders.get("x-forwarded-for") ?? "";
  const forwardedIp = forwardedFor
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .at(0);

  // x-real-ip is Railway's authoritative header (set by their edge proxy).
  // x-forwarded-for is NOT set or sanitized by Railway, so it can be spoofed by clients.
  const candidate = realIp || (env.NODE_ENV === "production" ? null : forwardedIp) || "unknown";
  return candidate.replace(/^\[?::ffff:/i, "").replace(/\]?$/, "").replace(/:\d+$/, "") || "unknown";
}

function getNetworkRequester(requestHeaders: Headers): RateLimitRequester {
  const ip = getClientIdentifier(requestHeaders);
  if (ip !== "unknown") {
    return {
      requester: `ip:${ip}`,
      requesterType: "ip",
    };
  }

  const fingerprintSource = [
    requestHeaders.get("user-agent")?.trim(),
    requestHeaders.get("accept-language")?.trim(),
    requestHeaders.get("referer")?.trim(),
  ]
    .filter(Boolean)
    .join("|");

  if (!fingerprintSource) {
    return {
      requester: "unknown",
      requesterType: "unknown",
    };
  }

  const fingerprint = createHash("sha256").update(fingerprintSource).digest("hex").slice(0, 32);
  return {
    requester: `fp:${fingerprint}`,
    requesterType: "fingerprint",
  };
}

export async function getRateLimitContext(
  requestHeaders: Headers,
  explicitClientId?: string | null,
): Promise<RateLimitContext> {
  const clientIdProvided = !!explicitClientId?.trim();
  const anonymousRequester = await getAnonymousRequester();
  const networkRequester = getNetworkRequester(requestHeaders);
  const requesters = [anonymousRequester, networkRequester].filter((requester, index, all) => (
    requester !== null &&
    all.findIndex((candidate) => candidate?.requester === requester.requester) === index
  )) as RateLimitRequester[];

  const [primaryRequester] = requesters;
  return {
    requester: primaryRequester.requester,
    requesterType: primaryRequester.requesterType,
    requesters,
    clientIdProvided,
    clientIdAccepted: false,
    anonymousIdProvided: anonymousRequester !== null,
    anonymousIdAccepted: anonymousRequester !== null,
  };
}

export function getRateLimitKeys(operation: string, context: RateLimitContext) {
  return context.requesters.map(({ requester }) => `${operation}:${requester}`);
}
