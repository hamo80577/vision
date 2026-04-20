import type { AppEnvironment, LogLevel } from "@vision/config";
import { parseApiConfig } from "@vision/config";

export type ApiRuntimeConfig = {
  appEnv: AppEnvironment;
  host: string;
  port: number;
  logLevel: LogLevel;
  serviceName: "vision-api";
};

export type ApiListenOptions = Pick<ApiRuntimeConfig, "host" | "port">;

export function getApiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): ApiRuntimeConfig {
  const config = parseApiConfig(env);

  return {
    appEnv: config.appEnv,
    host: config.host,
    port: config.port,
    logLevel: config.logLevel,
    serviceName: "vision-api"
  };
}

export function getApiListenOptions(
  env: NodeJS.ProcessEnv = process.env
): ApiListenOptions {
  const runtime = getApiRuntimeConfig(env);

  return {
    host: runtime.host,
    port: runtime.port
  };
}
