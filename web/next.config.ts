import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // partialPrefetching is off: with it on, any Date.now() after cookies() (Supabase auth checks token
  // expiry) is reported as a "Blocking Route" error on nearly every authenticated page.
  partialPrefetching: false,
  poweredByHeader: false,
  // Enables forbidden() for real 403 responses in guards (experimental in this Next.js version).
  experimental: {
    authInterrupts: true,
    // Server Actions carry small JSON payloads; the framework default is 1MB (SEC-005).
    serverActions: { bodySizeLimit: "100kb" },
  },
  async headers() {
    // Baseline hardening (SEC-001). A nonce-based CSP is a follow-up: it forces dynamic rendering.
    return [
      {
        source: "/:path*",
        headers: [
          {
            // Script/style sources are deliberately not restricted yet: a nonce-based CSP forces dynamic
            // rendering of every page (SEC-001 follow-up). These directives need no nonce.
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
