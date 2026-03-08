import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import { createClient } from "redis";
import { env } from "@/lib/env";
import { captureExpectedMessage, captureUnexpectedError } from "@/lib/monitoring";

type LimitName = "places" | "routes" | "traffic" | "push-write" | "push-delete";
type RateLimitBackend = "redis" | "memory";
type RateLimitFallbackReason = "connected" | "missing_url" | "connect_error";

interface LimitResult {
  ok: boolean;
  retryAfterSec: number;
  backend: RateLimitBackend;
  reason: RateLimitFallbackReason;
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

interface LimiterState {
  limiter: RateLimiterLike;
  backend: RateLimitBackend;
  reason: RateLimitFallbackReason;
  nextRedisRetryAt: number | null;
}

const REDIS_KEY = "__transitRedisClient__";
const RATE_LIMITER_KEY = "__transitRateLimiters__";
const REDIS_WARNING_KEY = "__transitRedisWarningShown__";
const REDIS_MISSING_KEY = "__transitRedisMissingShown__";
const REDIS_RETRY_MS = 30_000;

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    [REDIS_KEY]?: TransitRedisClient;
    [RATE_LIMITER_KEY]?: Partial<Record<LimitName, LimiterState>>;
    [REDIS_WARNING_KEY]?: boolean;
    [REDIS_MISSING_KEY]?: boolean;
  };
}

function reportMissingRedis(scoped: ReturnType<typeof getGlobalScope>) {
  if (scoped[REDIS_MISSING_KEY] || env.NODE_ENV !== "production") {
    return;
  }

  scoped[REDIS_MISSING_KEY] = true;
  captureExpectedMessage("Redis rate limiter is using in-memory fallback because REDIS_URL is not configured", {
    area: "rate-limit",
    tags: {
      rate_limit_backend: "memory",
      rate_limit_reason: "missing_url",
    },
  });
}

async function getRedisClient() {
  if (!env.REDIS_URL) {
    reportMissingRedis(getGlobalScope());
    return null;
  }

  const scoped = getGlobalScope();
  if (!scoped[REDIS_KEY]) {
    const client = createClient({ url: env.REDIS_URL });
    client.on("error", (error) => {
      if (!scoped[REDIS_WARNING_KEY]) {
        scoped[REDIS_WARNING_KEY] = true;
        captureExpectedMessage("Redis rate limiter connection error, falling back to memory", {
          area: "rate-limit",
          extra: { error },
        });
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
        captureExpectedMessage("Redis rate limiter unavailable, falling back to memory", {
          area: "rate-limit",
          extra: { error },
        });
      }
      return null;
    }
  }

  return client;
}

function createMemoryLimiter(name: LimitName, reason: Exclude<RateLimitFallbackReason, "connected">): LimiterState {
  const config = RATE_LIMIT_CONFIG[name];
  return {
    limiter: new RateLimiterMemory({
      keyPrefix: config.keyPrefix,
      points: config.points,
      duration: config.duration,
      blockDuration: config.blockDuration,
    }),
    backend: "memory",
    reason,
    nextRedisRetryAt: reason === "connect_error" ? Date.now() + REDIS_RETRY_MS : null,
  };
}

async function createRedisLimiter(name: LimitName): Promise<LimiterState | null> {
  const config = RATE_LIMIT_CONFIG[name];
  const redisClient = await getRedisClient();
  if (!redisClient) return null;

  return {
    limiter: new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: config.keyPrefix,
      points: config.points,
      duration: config.duration,
      blockDuration: config.blockDuration,
    }),
    backend: "redis",
    reason: "connected",
    nextRedisRetryAt: null,
  };
}

async function getLimiterState(name: LimitName): Promise<LimiterState> {
  const scoped = getGlobalScope();
  scoped[RATE_LIMITER_KEY] ??= {};

  const existing = scoped[RATE_LIMITER_KEY]![name];
  if (existing) {
    if (
      existing.backend === "memory" &&
      env.REDIS_URL &&
      existing.nextRedisRetryAt !== null &&
      existing.nextRedisRetryAt <= Date.now()
    ) {
      const redisLimiter = await createRedisLimiter(name);
      if (redisLimiter) {
        scoped[RATE_LIMITER_KEY]![name] = redisLimiter;
        return redisLimiter;
      }

      existing.reason = "connect_error";
      existing.nextRedisRetryAt = Date.now() + REDIS_RETRY_MS;
    }

    return existing;
  }

  const limiter =
    (await createRedisLimiter(name)) ??
    createMemoryLimiter(name, env.REDIS_URL ? "connect_error" : "missing_url");

  scoped[RATE_LIMITER_KEY]![name] = limiter;
  return limiter;
}

function toKey(key: string) {
  return key.trim() || "unknown";
}

function isRateLimitRejection(result: unknown): result is { msBeforeNext: number } {
  return (
    typeof result === "object" &&
    result !== null &&
    "msBeforeNext" in result &&
    typeof result.msBeforeNext === "number"
  );
}

export async function consumeRateLimit(name: LimitName, key: string): Promise<LimitResult> {
  const scoped = getGlobalScope();
  const limiterState = await getLimiterState(name);

  try {
    await limiterState.limiter.consume(toKey(key));
    return {
      ok: true,
      retryAfterSec: 0,
      backend: limiterState.backend,
      reason: limiterState.reason,
    };
  } catch (result) {
    if (isRateLimitRejection(result)) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil(result.msBeforeNext / 1000)),
        backend: limiterState.backend,
        reason: limiterState.reason,
      };
    }

    captureUnexpectedError(result, {
      area: "rate-limit",
      extra: {
        limiter: name,
        backend: limiterState.backend,
        reason: limiterState.reason,
      },
    });

    if (limiterState.backend === "redis") {
      const fallback = createMemoryLimiter(name, "connect_error");
      scoped[RATE_LIMITER_KEY] ??= {};
      scoped[RATE_LIMITER_KEY]![name] = fallback;

      try {
        await fallback.limiter.consume(toKey(key));
        return {
          ok: true,
          retryAfterSec: 0,
          backend: fallback.backend,
          reason: fallback.reason,
        };
      } catch (fallbackResult) {
        if (isRateLimitRejection(fallbackResult)) {
          return {
            ok: false,
            retryAfterSec: Math.max(1, Math.ceil(fallbackResult.msBeforeNext / 1000)),
            backend: fallback.backend,
            reason: fallback.reason,
          };
        }

        captureUnexpectedError(fallbackResult, {
          area: "rate-limit",
          extra: {
            limiter: name,
            backend: fallback.backend,
            reason: fallback.reason,
          },
        });
      }
    }

    return {
      ok: true,
      retryAfterSec: 0,
      backend: limiterState.backend,
      reason: limiterState.reason,
    };
  }
}
