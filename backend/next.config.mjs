/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: { instrumentationHook: true },
};

export default nextConfig;
