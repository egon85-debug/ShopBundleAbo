import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hochgeladene Produktbilder liegen lokal unter /public/uploads bzw. extern (S3/CDN).
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
