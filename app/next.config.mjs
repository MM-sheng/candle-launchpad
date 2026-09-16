/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: import.meta.dirname,
  webpack: (config) => {
    // Optional deps pulled in by wagmi's baseAccount connector that we don't use.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/evm/exact/client": false,
      "@x402/evm/upto/client": false,
      "@x402/svm/exact/client": false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};
export default nextConfig;
