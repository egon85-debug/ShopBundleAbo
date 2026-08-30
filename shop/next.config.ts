import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hochgeladene Produktbilder liegen lokal unter /public/uploads bzw. extern (S3/CDN).
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // Three.js & Co. nur dort bundeln, wo sie gebraucht werden.
  experimental: {
    optimizePackageImports: ["three", "@react-three/fiber", "@react-three/drei"],
  },
};

export default nextConfig;
