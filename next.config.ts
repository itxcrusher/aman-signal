import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Standalone output bundles only the files the server actually needs, which keeps
   * the deployed image small enough to pull quickly on a modest VM.
   */
  output: "standalone",

  /** better-sqlite3 is a native module and must not be bundled. */
  serverExternalPackages: ["better-sqlite3"],

  /**
   * Private-network origins allowed to load the dev server's own assets.
   *
   * Without this the dev server answers 403 to every request for
   * /_next/static/chunks/* that arrives from anything but localhost, React never
   * hydrates, and the page renders blank with no error visible on the device.
   * Testing on a real phone over the LAN is the only way to check how Nastaliq
   * actually renders on the hardware this product is built for, so that path has
   * to work.
   *
   * Dev only: Next ignores this in production, and these are private address
   * space that cannot be reached from the internet. The list is hostnames with
   * optional wildcards, not CIDR: CIDR notation is silently ignored and the
   * requests keep 403ing, which is exactly as confusing as it sounds.
   */
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
  ],

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
