import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Standalone output bundles only the files the server actually needs, which keeps
   * the deployed image small enough to pull quickly on a modest VM.
   */
  output: "standalone",

  /** better-sqlite3 is a native module and must not be bundled. */
  serverExternalPackages: ["better-sqlite3"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The citizen surface asks for microphone and location; nothing else.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
