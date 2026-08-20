/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  reactStrictMode: true,
  // Keep Prisma on the Node runtime so new models (e.g. TraideCategory) are not dropped by webpack.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg'],
  // standalone solo para producción (next build); en dev puede causar bloqueos en Windows
  ...(process.env.NODE_ENV === 'production' ? { output: 'standalone' } : {}),
  sassOptions: {
    includePaths: [path.join(__dirname, 'styles')],
  },
}

module.exports = nextConfig

