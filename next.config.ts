import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prints server-side fetches under the request that made them, so the
  // backend call behind a page render is visible in the dev terminal.
  logging: {
    fetches: { fullUrl: true },
  },
};

export default nextConfig;
