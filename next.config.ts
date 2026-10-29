import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['mysql2', 'mongodb'],
  outputFileTracingRoot: process.cwd(),
};
export default config;
