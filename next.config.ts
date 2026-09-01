import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const githubBasePath = process.env.GITHUB_ACTIONS === "true" && repositoryName
  ? `/${repositoryName}`
  : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: githubBasePath,
  assetPrefix: githubBasePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
