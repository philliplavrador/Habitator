/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 is a native (.node) module. Keep it out of the bundle so Next
  // requires it at runtime instead of trying to webpack-bundle the binary.
  // (On Next 14 this lives under `experimental`; it became top-level
  // `serverExternalPackages` in Next 15.)
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
    // recharts is already covered by Next 14.2's default optimizePackageImports;
    // framer-motion is not, so add it here to tree-shake its named imports.
    optimizePackageImports: ['framer-motion'],
  },
};

export default nextConfig;
