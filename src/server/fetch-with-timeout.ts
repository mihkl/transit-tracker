export async function fetchWithTimeoutAsync(
  url: string,
  timeoutMs = 10_000,
  init?: RequestInit,
) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  return fetch(url, { ...init, signal });
}
