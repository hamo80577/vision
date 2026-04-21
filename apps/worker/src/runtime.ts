import { parseWorkerConfig } from "@vision/config";

export type WorkerRuntimeConfig = {
  appEnv: "local" | "test" | "staging" | "production";
  databaseUrl: string;
  logLevel: "debug" | "info" | "warn" | "error";
  serviceName: "vision-worker";
};

export function getWorkerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): WorkerRuntimeConfig {
  const config = parseWorkerConfig(env);

  return {
    appEnv: config.appEnv,
    databaseUrl: config.databaseUrl,
    logLevel: config.logLevel,
    serviceName: "vision-worker"
  };
}
