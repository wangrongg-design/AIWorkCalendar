/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@work-calendar-ai/shared"],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.calendarsven.com" }],
        destination: "https://calendar.sevendata.cn/:path*",
        permanent: true
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "calendarsven.com" }],
        destination: "https://calendar.sevendata.cn/:path*",
        permanent: true
      }
    ];
  }
};

export default nextConfig;
