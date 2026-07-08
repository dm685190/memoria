import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "www.sprlrsrchlab.com" }],
        destination: "/site/index.html",
      },
      {
        source: "/:path((lab|graphify-map|knowledge-graph-viewer)\\.html)",
        has: [{ type: "host", value: "www.sprlrsrchlab.com" }],
        destination: "/site/:path",
      },
      {
        source: "/graph-data/:file*",
        has: [{ type: "host", value: "www.sprlrsrchlab.com" }],
        destination: "/site/graph-data/:file*",
      },
    ];
  },
};

export default nextConfig;
