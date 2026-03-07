export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startPushScheduler } = await import("@/server/push-scheduler");
  startPushScheduler();
}
