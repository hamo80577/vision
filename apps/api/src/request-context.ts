import {
  createObservabilityContext,
  type ObservabilityContext
} from "@vision/observability";

import type { ApiRuntimeConfig } from "./runtime";

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
};

function readHeader(
  headers: RequestLike["headers"],
  name: string
): string | undefined {
  const value = headers[name];

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find((entry) => typeof entry === "string");
  }

  return undefined;
}

export function createApiRequestContext(
  request: RequestLike,
  runtime: Pick<ApiRuntimeConfig, "appEnv" | "serviceName">
): ObservabilityContext {
  return createObservabilityContext({
    requestId: readHeader(request.headers, "x-request-id"),
    correlationId: readHeader(request.headers, "x-correlation-id"),
    service: runtime.serviceName,
    environment: runtime.appEnv
  });
}
