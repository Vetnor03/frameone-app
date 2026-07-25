import type { NextConfig } from "next";

const deploymentCommit = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/shop",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0, must-revalidate",
          },
          {
            key: "CDN-Cache-Control",
            value: "no-store",
          },
          {
            key: "Vercel-CDN-Cache-Control",
            value: "no-store",
          },
          {
            key: "X-Re-Mind-Deployment-Commit",
            value: deploymentCommit,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
