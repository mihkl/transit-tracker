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
