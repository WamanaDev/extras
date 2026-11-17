/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O app não usa next/image: desabilita o endpoint /_next/image
  // (superfície de ataque do GHSA-2464-fhr4-w9xw, RCE no Image Optimization API).
  images: { unoptimized: true },
};

module.exports = nextConfig;
