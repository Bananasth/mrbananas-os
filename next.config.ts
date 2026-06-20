import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Linting is run separately via the flat ESLint config (npm run lint / CI).
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
