import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Android emulator (canvas WebView i Chrome u njemu) prilazi dev serveru kao
  // http://10.0.2.2:3000. Bez ovog allowlist-a Next 16 vrati 403 na
  // /_next/webpack-hmr websocket, React-ov debug kanal (koji ide tim socketom)
  // nikad ne poteče i hidracija visi zauvek — prazna stranica bez greške.
  // Samo dev; detalji u docs/mobile/KANVAS-DIJAGNOZA.md.
  allowedDevOrigins: ["10.0.2.2"],
  // Monorepo: lockfile i packages/backend žive dva nivoa iznad apps/web.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  experimental: {
    // Dozvoli import fajlova van apps/web (packages/backend/convex/_generated).
    externalDir: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "X-Robots-Tag",
            value:
              "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
