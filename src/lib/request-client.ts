export function getClientIdentifier(requestHeaders: Headers) {
  const forwardedFor = requestHeaders.get("x-forwarded-for") ?? "";
  const forwardedIp = forwardedFor
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .at(0);

  const realIp = requestHeaders.get("x-real-ip")?.trim();
  return forwardedIp || realIp || "unknown";
}
