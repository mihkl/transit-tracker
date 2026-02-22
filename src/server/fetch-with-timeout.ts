export async function fetchWithTimeout(
  url: string,
  timeoutMs = 10_000,
  init?: RequestInit,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);

  let signal: AbortSignal = timeoutController.signal;
  if (init?.signal) {
    if (typeof AbortSignal.any === "function") {
      signal = AbortSignal.any([init.signal, timeoutController.signal]);
    } else {
      const combinedController = new AbortController();
      const abortCombined = () => combinedController.abort();
      init.signal.addEventListener("abort", abortCombined, { once: true });
      timeoutController.signal.addEventListener("abort", abortCombined, {
        once: true,
      });
      signal = combinedController.signal;
    }
  }

  try {
    return await fetch(url, { ...init, signal });
  } finally {
    clearTimeout(timeout);
  }
}
