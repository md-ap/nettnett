import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  async redirects() {
    return [
      // The member panel was renamed /dashboard → /upload; keep old links alive
      {
        source: "/dashboard/:path*",
        destination: "/upload/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
