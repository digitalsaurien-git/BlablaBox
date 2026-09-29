/**
 * Sentry integration — server-side error monitoring.
 *
 * Activé uniquement quand SENTRY_DSN est défini dans l'environnement.
 * Aucune donnée n'est envoyée si la variable est absente ou vide.
 *
 * Installation : npm install @sentry/nextjs
 * Puis définir SENTRY_DSN dans les variables Coolify de production.
 */

interface SentryEvent {
  error: unknown;
  context?: Record<string, unknown>;
  tags?: Record<string, string>;
}

let sentryInitialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;

async function ensureInitialized(): Promise<boolean> {
  if (sentryInitialized) return Sentry !== null;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    sentryInitialized = true;
    return false;
  }

  try {
    // Use a variable to prevent TypeScript from resolving the module at compile time.
    // @sentry/nextjs is an optional dependency — installed only when Sentry is configured.
    const mod = "@sentry/nextjs";
    Sentry = await import(/* webpackIgnore: true */ mod);
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      beforeSend(event: any) {
        // Ne jamais envoyer de données sensibles
        if (event.request?.headers) {
          delete event.request.headers["cookie"];
          delete event.request.headers["authorization"];
        }
        return event;
      },
    });
    sentryInitialized = true;
    return true;
  } catch {
    // @sentry/nextjs n'est pas installé — mode silencieux
    sentryInitialized = true;
    return false;
  }
}

/**
 * Capture une erreur vers Sentry (no-op si SENTRY_DSN n'est pas défini
 * ou si @sentry/nextjs n'est pas installé).
 */
export async function captureError({ error, context, tags }: SentryEvent): Promise<void> {
  const ready = await ensureInitialized();
  if (!ready || !Sentry) return;

  const err = error instanceof Error ? error : new Error(String(error));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Sentry.withScope((scope: any) => {
    if (context) scope.setContext("extra", context);
    if (tags) {
      for (const [key, value] of Object.entries(tags)) {
        scope.setTag(key, value);
      }
    }
    Sentry!.captureException(err);
  });
}

/**
 * Capture un message informatif vers Sentry.
 */
export async function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): Promise<void> {
  const ready = await ensureInitialized();
  if (!ready || !Sentry) return;

  Sentry.captureMessage(message, level);
}
