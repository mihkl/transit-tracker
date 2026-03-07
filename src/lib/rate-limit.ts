import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import { createClient } from "redis";
import { env } from "@/lib/env";

type LimitName = "places" | "routes" | "traffic" | "push-write" | "push-delete";

interface LimitResult {
  ok: boolean;
  retryAfterSec: number;
}

const RATE_LIMIT_CONFIG: Record<
  LimitName,
  {
    points: number;
    duration: number;
    blockDuration?: number;
    keyPrefix: string;
  }
> = {
  places: {
    points: 60,
    duration: 60,
    blockDuration: 60,
    keyPrefix: "rl:places",
  },
  routes: {
    points: 20,
    duration: 60,
    blockDuration: 60,
    keyPrefix: "rl:routes",
  },
  traffic: {
    points: 30,
    duration: 60,
    blockDuration: 60,
    keyPrefix: "rl:traffic",
  },
  "push-write": {
    points: 12,
    duration: 60,
    blockDuration: 120,
    keyPrefix: "rl:push-write",
  },
  "push-delete": {
    points: 20,
    duration: 60,
    blockDuration: 60,
    keyPrefix: "rl:push-delete",
  },
};

type RateLimiterLike = Pick<RateLimiterMemory, "consume">;
type TransitRedisClient = ReturnType<typeof createClient>;

const REDIS_KEY = "__transitRedisClient__";
const RATE_LIMITER_KEY = "__transitRateLimiters__";
const REDIS_WARNING_KEY = "__transitRedisWarningShown__";

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    [REDIS_KEY]?: TransitRedisClient;
    [RATE_LIMITER_KEY]?: Partial<Record<LimitName, RateLimiterLike>>;
    [REDIS_WARNING_KEY]?: boolean;
  };
}

async function getRedisClient() {
  if (!env.REDIS_URL) return null;

  const scoped = getGlobalScope();
  if (!scoped[REDIS_KEY]) {
    const client = createClient({ url: env.REDIS_URL });
    client.on("error", (error) => {
      if (!scoped[REDIS_WARNING_KEY]) {
        scoped[REDIS_WARNING_KEY] = true;
        console.warn("Redis rate limiter connection error, falling back to memory:", error);
      }
    });
    scoped[REDIS_KEY] = client;
  }

  const client = scoped[REDIS_KEY]!;
  if (!client.isOpen) {
    try {
      await client.connect();
    } catch (error) {
      if (!scoped[REDIS_WARNING_KEY]) {
        scoped[REDIS_WARNING_KEY] = true;
        console.warn("Redis rate limiter unavailable, falling back to memory:", error);
      }
      return null;
    }
  }

  return client;
}

async function getLimiter(name: LimitName): Promise<RateLimiterLike> {
  const scoped = getGlobalScope();
  scoped[RATE_LIMITER_KEY] ??= {};

  const existing = scoped[RATE_LIMITER_KEY]![name];
  if (existing) return existing;

  const config = RATE_LIMIT_CONFIG[name];
  const redisClient = await getRedisClient();

  const limiter = redisClient
    ? new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: config.keyPrefix,
        points: config.points,
        duration: config.duration,
        blockDuration: config.blockDuration,
      })
    : new RateLimiterMemory({
        keyPrefix: config.keyPrefix,
        points: config.points,
        duration: config.duration,
        blockDuration: config.blockDuration,
      });

  scoped[RATE_LIMITER_KEY]![name] = limiter;
  return limiter;
}

function toKey(key: string) {
  return key.trim() || "unknown";
}

export async function consumeRateLimit(name: LimitName, key: string): Promise<LimitResult> {
  const limiter = await getLimiter(name);

  try {
    await limiter.consume(toKey(key));
    return { ok: true, retryAfterSec: 0 };
  } catch (result) {
    const retryAfterMs =
      typeof result === "object" &&
      result !== null &&
      "msBeforeNext" in result &&
      typeof result.msBeforeNext === "number"
        ? result.msBeforeNext
        : 60_000;

    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }
}
