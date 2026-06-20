/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  devIndicators: false,
  allowedDevOrigins: (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  async rewrites() {
    const mediaServiceUrl = (process.env.MEDIA_SERVICE_URL ?? "http://localhost:4108").replace(/\/$/, "");
    return [{ source: "/media/public/:path*", destination: `${mediaServiceUrl}/media/public/:path*` }];
  }
};

export default nextConfig;
