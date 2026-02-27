import { formatCoord } from "@/lib/format-utils";

const DB_NAME = "transit-tracker";
const DB_VERSION = 1;
const ROUTES_STORE = "saved_routes";
const LOCATIONS_STORE = "saved_locations";

export interface PlannerPointValue {
  lat: number;
  lng: number;
  name?: string;
}

export interface SavedPoint {
  lat: number;
  lng: number;
  name: string;
}

export interface SavedRouteRecord {
  id: string;
  label: string;
  origin: SavedPoint;
  destination: SavedPoint;
  createdAt: string;
  updatedAt: string;
}

export interface SavedLocationRecord {
  id: string;
  name: string;
  nickname?: string;
  lat: number;
  lng: number;
  createdAt: string;
  updatedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCoord(value: number): string {
  return value.toFixed(5);
}

function getPointLabel(point: PlannerPointValue): string {
  const clean = point.name?.trim();
  if (clean) return clean;
  return formatCoord(point.lat, point.lng);
}

function toSavedPoint(point: PlannerPointValue): SavedPoint {
  return {
    lat: point.lat,
    lng: point.lng,
    name: getPointLabel(point),
  };
}

function buildLocationId(lat: number, lng: number): string {
  return [normalizeCoord(lat), normalizeCoord(lng)].join("|");
}

function buildRouteId(origin: SavedPoint, destination: SavedPoint): string {
  return [
    normalizeText(origin.name),
    normalizeCoord(origin.lat),
    normalizeCoord(origin.lng),
    "=>",
    normalizeText(destination.name),
    normalizeCoord(destination.lat),
    normalizeCoord(destination.lng),
  ].join("|");
}

function buildRouteLabel(origin: SavedPoint, destination: SavedPoint): string {
  return `${origin.name} to ${destination.name}`;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function isIndexedDbSupported(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbSupported()) {
    throw new Error("IndexedDB is not supported in this browser.");
  }

  if (!dbPromise) {
    const openingPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ROUTES_STORE)) {
          const routeStore = db.createObjectStore(ROUTES_STORE, { keyPath: "id" });
          routeStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(LOCATIONS_STORE)) {
          const locationStore = db.createObjectStore(LOCATIONS_STORE, { keyPath: "id" });
          locationStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };

      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
      request.onblocked = () => reject(new Error("IndexedDB open request blocked."));
    });

    dbPromise = openingPromise.catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise as Promise<IDBDatabase>;
}

async function withStore<T>(
  storeName: typeof ROUTES_STORE | typeof LOCATIONS_STORE,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, mode);
  const done = transactionToPromise(transaction);
  const store = transaction.objectStore(storeName);

  try {
    const result = await handler(store);
    await done;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already be finished.
    }
    await done.catch(() => undefined);
    throw error;
  }
}

function byMostRecent<T extends { updatedAt: string }>(a: T, b: T): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

export function supportsPlannerPersistence(): boolean {
  return isIndexedDbSupported();
}

export async function listSavedRoutes(): Promise<SavedRouteRecord[]> {
  const records = await withStore(ROUTES_STORE, "readonly", async (store) => {
    const all = await requestToPromise(store.getAll() as IDBRequest<SavedRouteRecord[]>);
    return all ?? [];
  });
  return records.sort(byMostRecent);
}

export async function listSavedLocations(): Promise<SavedLocationRecord[]> {
  const records = await withStore(LOCATIONS_STORE, "readonly", async (store) => {
    const all = await requestToPromise(store.getAll() as IDBRequest<SavedLocationRecord[]>);
    return all ?? [];
  });
  return records.sort(byMostRecent);
}

export async function upsertSavedRoute(
  originInput: PlannerPointValue,
  destinationInput: PlannerPointValue,
): Promise<SavedRouteRecord> {
  const origin = toSavedPoint(originInput);
  const destination = toSavedPoint(destinationInput);
  const id = buildRouteId(origin, destination);
  const now = new Date().toISOString();

  return withStore(ROUTES_STORE, "readwrite", async (store) => {
    const existing = await requestToPromise(
      store.get(id) as IDBRequest<SavedRouteRecord | undefined>,
    );
    const record: SavedRouteRecord = {
      id,
      label: buildRouteLabel(origin, destination),
      origin,
      destination,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await requestToPromise(store.put(record));
    return record;
  });
}

export async function upsertSavedLocation(
  pointInput: PlannerPointValue,
  nickname?: string,
): Promise<SavedLocationRecord> {
  const point = toSavedPoint(pointInput);
  const id = buildLocationId(point.lat, point.lng);
  const now = new Date().toISOString();

  return withStore(LOCATIONS_STORE, "readwrite", async (store) => {
    const existing = await requestToPromise(
      store.get(id) as IDBRequest<SavedLocationRecord | undefined>,
    );
    const record: SavedLocationRecord = {
      id,
      name: point.name,
      nickname: nickname?.trim() || existing?.nickname,
      lat: point.lat,
      lng: point.lng,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await requestToPromise(store.put(record));
    return record;
  });
}

export async function updateLocationNickname(id: string, nickname: string): Promise<void> {
  await withStore(LOCATIONS_STORE, "readwrite", async (store) => {
    const existing = await requestToPromise(
      store.get(id) as IDBRequest<SavedLocationRecord | undefined>,
    );
    if (!existing) return;
    const cleaned = nickname.trim();
    existing.nickname = cleaned && cleaned !== existing.name ? cleaned : undefined;
    existing.updatedAt = new Date().toISOString();
    await requestToPromise(store.put(existing));
  });
}

export async function deleteSavedRoute(id: string): Promise<void> {
  await withStore(ROUTES_STORE, "readwrite", async (store) => {
    await requestToPromise(store.delete(id));
  });
}

export async function deleteSavedLocation(id: string): Promise<void> {
  await withStore(LOCATIONS_STORE, "readwrite", async (store) => {
    await requestToPromise(store.delete(id));
  });
}
