import { createHash } from "node:crypto";

function sanitizeClientId(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "");
  if (normalized.length < 8) return null;

  return normalized.slice(0, 128);
}

export function getClientIdentifier(requestHeaders: Headers) {
  const forwardedFor = requestHeaders.get("x-forwarded-for") ?? "";
  const forwardedIp = forwardedFor
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .at(0);

  const realIp = requestHeaders.get("x-real-ip")?.trim();
  const candidate = forwardedIp || realIp || requestHeaders.get("cf-connecting-ip")?.trim() || "unknown";
  return candidate.replace(/^\[?::ffff:/i, "").replace(/\]?$/, "").replace(/:\d+$/, "") || "unknown";
}

export function getRateLimitIdentifier(requestHeaders: Headers, explicitClientId?: string | null) {
  const clientId = sanitizeClientId(explicitClientId);
  if (clientId) {
    return `client:${clientId}`;
  }

  const ip = getClientIdentifier(requestHeaders);
  if (ip !== "unknown") {
    return `ip:${ip}`;
  }

  const fingerprintSource = [
    requestHeaders.get("user-agent")?.trim(),
    requestHeaders.get("accept-language")?.trim(),
    requestHeaders.get("referer")?.trim(),
  ]
    .filter(Boolean)
    .join("|");

  if (!fingerprintSource) {
    return "unknown";
  }

  const fingerprint = createHash("sha256").update(fingerprintSource).digest("hex").slice(0, 32);
  return `fp:${fingerprint}`;
}
