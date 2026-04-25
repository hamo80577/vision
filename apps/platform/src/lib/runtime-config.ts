import { parsePlatformConfig, type PlatformConfig } from "@vision/config";

let cachedConfig: PlatformConfig | null = null;

export function getPlatformRuntimeConfig(): PlatformConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = parsePlatformConfig({
    APP_ENV: process.env.APP_ENV ?? "local",
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000",
  });

  return cachedConfig;
}
