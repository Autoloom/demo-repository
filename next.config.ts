import type { NextConfig } from "next";

// GitHub Pages serves this repo at https://<org>.github.io/demo-repository/,
// so all routes and assets need that path prefix baked in at build time.
const repoBasePath = "/demo-repository";

const nextConfig: NextConfig = {
  output: "export",
  basePath: repoBasePath,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
