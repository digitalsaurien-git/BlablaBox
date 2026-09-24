import { captureError } from "@/lib/sentry";

/**
 * Wrapper pour server actions qui capture les erreurs imprévues vers Sentry.
 * Les erreurs sont toujours re-lancées pour ne pas casser le flux Next.js.
 */
export async function withErrorCapture<T>(
  actionName: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Les redirections Next.js lancent une erreur spéciale — ne pas les capturer
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }
    await captureError({
      error,
      tags: { action: actionName },
      context: { actionName },
    }).catch(() => undefined);
    throw error;
  }
}
