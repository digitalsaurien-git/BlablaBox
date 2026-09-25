import type { NextConfig } from "next";

const sentryDsn = process.env.SENTRY_DSN ?? "";
const sentryHost = sentryDsn ? (() => { try { return new URL(sentryDsn).hostname; } catch { return ""; } })() : "";

const nextConfig: NextConfig = {
  serverActions: {
    bodySizeLimit: "4mb",
  },

  async headers() {
    return [
      // Assets statiques versionnés par Next.js — immutables (I-4)
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Fichiers publics non versionnés (favicon, icônes, manifeste…)
      {
        source: "/(favicon\\.ico|robots\\.txt|site\\.webmanifest|.*\\.png|.*\\.svg|.*\\.ico)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      // Règle générale de sécurité sur toutes les routes
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              `connect-src 'self'${sentryHost ? ` https://${sentryHost}` : ""}`,
              "media-src 'self' blob:",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
