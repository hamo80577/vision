import { sanitizeObservabilityId } from "./ids";

export interface ActiveTrace {
  name: string;
  traceId?: string;
  end(meta?: Record<string, unknown>): void;
  error(error: unknown): void;
}

export interface ObservabilityTracer {
  startTrace(
    name: string,
    options?: {
      traceId?: string;
    }
  ): ActiveTrace;
}

export function createNoopTracer(): ObservabilityTracer {
  return {
    startTrace(name, options) {
      return {
        name,
        traceId: sanitizeObservabilityId(options?.traceId),
        end(_meta?: Record<string, unknown>) {
          return undefined;
        },
        error(_error: unknown) {
          return undefined;
        }
      };
    }
  };
}
