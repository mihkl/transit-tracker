import * as Sentry from "@sentry/nextjs";

type MonitoringTags = Record<string, string | number | boolean | null | undefined>;
type MonitoringExtra = Record<string, unknown>;

interface MonitoringContext {
  area: string;
  kind?: "expected" | "unexpected";
  clientId?: string | null;
  level?: Sentry.SeverityLevel;
  tags?: MonitoringTags;
  extra?: MonitoringExtra;
  fingerprint?: string[];
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : "Unknown error");
}

function applyScope(scope: Sentry.Scope, context: MonitoringContext) {
  scope.setTag("area", context.area);
  scope.setTag("kind", context.kind ?? "unexpected");

  if (context.clientId) {
    scope.setUser({ id: context.clientId });
    scope.setTag("client_id", context.clientId);
    scope.setContext("session", { clientId: context.clientId });
  }

  for (const [key, value] of Object.entries(context.tags ?? {})) {
    if (value === undefined || value === null) continue;
    scope.setTag(key, String(value));
  }

  if (context.extra && Object.keys(context.extra).length > 0) {
    scope.setContext("details", context.extra);
  }

  if (context.fingerprint?.length) {
    scope.setFingerprint(context.fingerprint);
  }
}

function logServer(level: "warn" | "error", message: string, extra?: MonitoringExtra) {
  if (typeof window !== "undefined") return;
  if (extra && Object.keys(extra).length > 0) {
    console[level](message, extra);
    return;
  }
  console[level](message);
}

export function captureExpectedMessage(message: string, context: MonitoringContext) {
  logServer("warn", message, context.extra);

  Sentry.withScope((scope) => {
    applyScope(scope, { ...context, kind: "expected" });
    scope.setLevel(context.level ?? "warning");
    Sentry.captureMessage(message);
  });
}

export function captureUnexpectedError(error: unknown, context: MonitoringContext) {
  const normalizedError = normalizeError(error);
  logServer("error", normalizedError.message, {
    ...(context.extra ?? {}),
    stack: normalizedError.stack,
  });

  Sentry.withScope((scope) => {
    applyScope(scope, { ...context, kind: "unexpected" });
    if (context.level) {
      scope.setLevel(context.level);
    }
    Sentry.captureException(normalizedError);
  });
}

export function setMonitoringUser(clientId: string) {
  Sentry.setUser({ id: clientId });
  Sentry.setTag("client_id", clientId);
  Sentry.setContext("session", { clientId });
}
