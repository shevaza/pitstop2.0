import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.185.42.99", "localhost", "127.0.0.1"],
  outputFileTracingExcludes: {
    "/*": ["./itc-srv-10/**/*", "./pitstop-scraper/**/*", "./.data/mssql-settings.json", "./mobile/**/*"],
  },
};

export default nextConfig;
