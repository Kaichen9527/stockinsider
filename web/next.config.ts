import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Authorization codes must not enter Next development request logs.
  logging: { incomingRequests: { ignore: [/\/api\/owner\/callback(?:\?|$)/] } },
  async headers() {
    return [{ source: '/private-research', headers: [
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
      { key: 'Surrogate-Control', value: 'no-store' },
      { key: 'Vary', value: 'Cookie, Authorization' },
      // Native POST forms need their same-origin Origin header for CSRF checks.
      // no-referrer turns that Origin into null for navigation requests. This
      // policy still suppresses Referer entirely when navigating to the IdP.
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] }];
  },
  // Contabo releases ship only the traced runtime. This prevents every rollback
  // copy from carrying the complete development dependency tree.
  output: "standalone",
  // Isolated preview deployments may publish their immutable chunks under a
  // namespaced nginx alias without touching the production app's chunk set.
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || undefined,
  // Local backups are not application dependencies, even when filesystem
  // tracing sees the parent repository. Git ignore rules do not govern tracing.
  outputFileTracingExcludes: {
    '/*': ['**/backup/**/*'],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
