import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
