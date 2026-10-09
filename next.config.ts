import type { NextConfig } from "next";

// Origins allowed to embed /embed in an <iframe>, space-separated, e.g. "https://example.com https://app.example.com".
const embedOrigins = (process.env.EMBED_ALLOWED_ORIGINS ?? "").split(/\s+/).filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/embed",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${embedOrigins.join(" ")}`.trim() },
        ],
      },
      {
        // Everything else must not be framed (clickjacking protection).
        source: "/((?!embed).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
