import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Server-only agent runtime: keep Mastra, pg and the PDF parser out of the bundler.
  serverExternalPackages: ['@mastra/core', '@mastra/pg', '@mastra/loggers', '@mastra/mcp', 'pg', 'pino', 'unpdf'],
  experimental: { serverActions: { bodySizeLimit: '26mb' } },
  partialPrefetching: true,
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
