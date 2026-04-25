import { parseErpConfig, type ErpConfig } from "@vision/config";

let cachedConfig: ErpConfig | null = null;

export function getErpRuntimeConfig(): ErpConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = parseErpConfig({
    APP_ENV: process.env.APP_ENV ?? "local",
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000",
  });

  return cachedConfig;
}
