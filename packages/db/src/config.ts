import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  parseDatabaseAdminConfig,
  parseDatabaseRuntimeConfig,
  type DatabaseAdminConfig,
  type DatabaseRuntimeConfig,
  type RuntimeEnv,
} from "@vision/config";

export type { DatabaseAdminConfig, DatabaseRuntimeConfig };

const loadedEnvFiles = new Set<string>();

function findParentEnvFile(startDirectory: string): string | undefined {
  let currentDirectory = resolve(startDirectory);

  while (true) {
    const envPath = join(currentDirectory, ".env");

    if (existsSync(envPath)) {
      return envPath;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return undefined;
    }

    currentDirectory = parentDirectory;
  }
}

function loadProcessEnvFile(env: RuntimeEnv): RuntimeEnv {
  if (env !== process.env) {
    return env;
  }

  const envPath = findParentEnvFile(process.cwd());

  if (envPath && !loadedEnvFiles.has(envPath)) {
    process.loadEnvFile(envPath);
    loadedEnvFiles.add(envPath);
  }

  return env;
}

export function getDatabaseRuntimeConfig(env: RuntimeEnv = process.env): DatabaseRuntimeConfig {
  return parseDatabaseRuntimeConfig(loadProcessEnvFile(env));
}

export function getDatabaseAdminConfig(env: RuntimeEnv = process.env): DatabaseAdminConfig {
  return parseDatabaseAdminConfig(loadProcessEnvFile(env));
}
