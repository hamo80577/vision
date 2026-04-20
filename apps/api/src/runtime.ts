import { parseApiConfig, type ApiConfig } from "@vision/config";

export type ApiListenOptions = Pick<ApiConfig, "host" | "port">;

export function getApiListenOptions(
  env: NodeJS.ProcessEnv = process.env
): ApiListenOptions {
  const config = parseApiConfig(env);

  return {
    host: config.host,
    port: config.port
  };
}
