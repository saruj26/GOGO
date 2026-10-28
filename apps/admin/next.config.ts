import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript source rather than a build step.
  transpilePackages: ['@rideflow/shared'],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Keeps the map library out of the initial bundle.
    optimizePackageImports: ['maplibre-gl'],
  },
};

export default config;
