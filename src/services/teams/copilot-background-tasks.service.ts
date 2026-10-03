const pendingTasks = new Set<Promise<void>>();

type BackgroundTaskMeta = {
  activityId?: string | null;
  conversationId?: string | null;
};

/**
 * Register a long-running Copilot task without blocking the inbound webhook.
 *
 * Microsoft Bot Framework expects the webhook request to be acknowledged fast.
 * Chat SDK exposes waitUntil() for exactly this pattern. On a long-lived Express
 * process we keep a local reference to the promise, log failures, and let the
 * task continue after the HTTP response has already been returned.
 */
export function registerCopilotBackgroundTask(
  task: Promise<unknown>,
  meta: BackgroundTaskMeta = {},
): void {
  let tracked: Promise<void>;

  tracked = Promise.resolve(task)
    .then(() => undefined)
    .catch((error) => {
      console.error("[COPILOT BACKGROUND TASK FAILED]", {
        activityId: meta.activityId ?? null,
        conversationId: meta.conversationId ?? null,
        error,
      });
    })
    .finally(() => {
      pendingTasks.delete(tracked);
    });

  pendingTasks.add(tracked);
}

export function getCopilotBackgroundTaskCount(): number {
  return pendingTasks.size;
}

/**
 * Optional graceful-shutdown helper. It never waits forever.
 */
export async function drainCopilotBackgroundTasks(
  timeoutMs = 10_000,
): Promise<void> {
  if (pendingTasks.size === 0) {
    return;
  }

  const snapshot = Array.from(pendingTasks);

  await Promise.race([
    Promise.allSettled(snapshot).then(() => undefined),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs).unref();
    }),
  ]);
}
