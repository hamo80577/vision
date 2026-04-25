/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@vision/config",
    "@vision/contracts",
    "@vision/design-system",
    "@vision/ui",
    "@vision/validation",
  ],
};

export default nextConfig;
