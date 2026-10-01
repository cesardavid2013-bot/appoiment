import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Player origins for featured social posts — exactly the hosts that
 * domain/social.ts `embedFrame()` builds iframe URLs for. YouTube thumbnails
 * (i.ytimg.com) are the only third-party images. Keep these lists in sync.
 */
const EMBED_FRAME_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://www.tiktok.com",
  "https://www.instagram.com",
  "https://player.vimeo.com",
  "https://w.soundcloud.com",
  "https://open.spotify.com",
].join(" ");

/**
 * Content-Security-Policy. Next's inline bootstrap scripts need 'unsafe-inline'
 * (no nonces on statically rendered pages); everything else is locked to our
 * origin plus Stripe (checkout), OpenStreetMap tiles (maps) and the social
 * players above (click-to-load only).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://js.stripe.com${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.stripe.com https://i.ytimg.com",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  `connect-src 'self' https://api.stripe.com https://*.stripe.com${dev ? " ws: wss:" : ""}`,
  `frame-src https://js.stripe.com https://hooks.stripe.com ${EMBED_FRAME_ORIGINS}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(!dev ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["@node-rs/argon2", "sharp"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
