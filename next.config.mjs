/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained .next/standalone directory — ideal for Docker/Cloud Run
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: [
      'mupdf',
      '@google-cloud/bigquery',
      '@google-cloud/storage',
      '@google-cloud/vision',
    ],
  },
};

export default nextConfig;
