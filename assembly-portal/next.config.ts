import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/login", destination: "/", permanent: false },
      { source: "/dashboard", destination: "/", permanent: false },
      { source: "/finance", destination: "/", permanent: false },
      { source: "/director", destination: "/", permanent: false },
      { source: "/principal", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
