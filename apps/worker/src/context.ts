import {
  createObservabilityContext,
  type ObservabilityContext,
  type ObservabilityContextInput
} from "@vision/observability";

type RuntimeLike = {
  appEnv: string;
  serviceName: string;
};

export function createWorkerOperationContext(
  runtime: RuntimeLike,
  input: ObservabilityContextInput = {}
): ObservabilityContext {
  return createObservabilityContext({
    ...input,
    service: runtime.serviceName,
    environment: runtime.appEnv
  });
}
