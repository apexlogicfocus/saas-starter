import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// This project lives inside a multi-project monorepo, so pin the tracing/turbopack
// root to this app to silence Next's "inferred workspace root" warning.
const root = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: root,
  turbopack: { root },
};

export default nextConfig;
