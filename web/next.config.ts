import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Contabo releases ship only the traced runtime. This prevents every rollback
  // copy from carrying the complete development dependency tree.
  output: "standalone",
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
