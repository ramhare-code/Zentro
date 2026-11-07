import type { NextConfig } from "next";


const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const imageHosts = (process.env.MEDIA_REMOTE_HOSTS ?? "images.unsplash.com").split(",").map((h) => h.trim()).filter(Boolean);
const dev = process.env.NODE_ENV === "development";
// Pages are cached (ISR), so per-request nonces aren't possible; inline scripts are Next's own bootstrap and
// JSON-LD. The policy still blocks scripts from any other site, plugins, framing and form hijacking.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.razorpay.com ${imageHosts.map((h) => `https://${h}`).join(" ")}${supabaseHost ? ` https://${supabaseHost}` : ""}`,
  "font-src 'self'",
  "connect-src 'self' https://*.razorpay.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self \"https://checkout.razorpay.com\" \"https://api.razorpay.com\")" },
  { key: "Content-Security-Policy", value: csp },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }, // Razorpay may open bank pages in a popup
];

const nextConfig: NextConfig = {
  transpilePackages: ["@zentro/commerce"],
  serverExternalPackages: ["sharp"],
  // review photos: up to 3 × 5 MB (default limit is 1 MB)
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // approved external image hosts (same list the admin accepts for image links)
      ...(process.env.MEDIA_REMOTE_HOSTS ?? "images.unsplash.com").split(",").map((h) => h.trim()).filter(Boolean)
        .map((hostname) => ({ protocol: "https" as const, hostname })),
      // production media: Supabase Storage public bucket
      ...(supabaseHost ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }] : []),
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
