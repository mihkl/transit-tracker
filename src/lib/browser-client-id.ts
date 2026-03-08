const STORAGE_KEY = "transit-client-id";

let cachedClientId: string | null = null;

function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function getBrowserClientId() {
  if (typeof window === "undefined") return null;
  if (cachedClientId) return cachedClientId;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && /^[a-zA-Z0-9_-]{8,128}$/.test(stored)) {
      cachedClientId = stored;
      return cachedClientId;
    }

    const generated = createClientId();
    window.localStorage.setItem(STORAGE_KEY, generated);
    cachedClientId = generated;
    return cachedClientId;
  } catch {
    cachedClientId = createClientId();
    return cachedClientId;
  }
}
