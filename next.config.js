/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  reactStrictMode: true,
  // Keep Prisma on the Node runtime so new models (e.g. TraideCategory) are not dropped by webpack.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg'],
  // standalone for production / Docker images; skip in local `next dev` on Windows
  ...(process.env.NODE_ENV === 'production' || process.env.DOCKER_BUILD === '1'
    ? { output: 'standalone' }
    : {}),
  sassOptions: {
    includePaths: [path.join(__dirname, 'styles')],
  },
}

module.exports = nextConfig

