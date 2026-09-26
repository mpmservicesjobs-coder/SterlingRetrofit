import type { NextConfig } from "next";

const config: NextConfig = {
  basePath: "/note",
  serverExternalPackages: ["@react-pdf/renderer", "@electric-sql/pglite", "pg"],
  // The PDF reads the logo and fonts from disk at run time.
  outputFileTracingIncludes: { "/**": ["./assets/**"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default config;
