import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "@/lib/env";

const DB_KEY = "__transitPushDb__";

function resolveDbPath() {
  const configuredPath = env.PUSH_DB_PATH?.trim();
  const dbPath = configuredPath
    ? isAbsolute(configuredPath)
      ? configuredPath
      : resolve(process.cwd(), configuredPath)
    : resolve(process.cwd(), "data", "push-notifications.sqlite");

  mkdirSync(dirname(dbPath), { recursive: true });
  return dbPath;
}

function getDbInstance() {
  const scoped = globalThis as typeof globalThis & {
    [DB_KEY]?: ReturnType<typeof drizzle>;
  };

  if (!scoped[DB_KEY]) {
    const client = createClient({
      url: pathToFileURL(resolveDbPath()).href,
    });
    scoped[DB_KEY] = drizzle(client);
  }

  return scoped[DB_KEY];
}

export const pushDb = getDbInstance();
