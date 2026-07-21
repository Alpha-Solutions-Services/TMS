/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.sanity.io" },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/freight/login", destination: "/login", permanent: true },
      { source: "/freight/dispatcher/:path*", destination: "/dispatcher/:path*", permanent: true },
      { source: "/freight/carrier/:path*", destination: "/carrier/:path*", permanent: true },
      { source: "/freight/driver/:path*", destination: "/driver/:path*", permanent: true },
      { source: "/freight/student/:path*", destination: "/login", permanent: true },
      { source: "/freight/instructor/:path*", destination: "/login", permanent: true },
      { source: "/freight/dispatch-training", destination: "/login", permanent: true },
      { source: "/freight", destination: "/login", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
