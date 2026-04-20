import type { AppEnvironment } from "@vision/config";

export function getWorkerStatus(environment: AppEnvironment) {
  return {
    service: "vision-worker",
    status: "idle",
    environment
  } as const;
}
