import { sanitizeObservabilityId } from "./ids";

export interface ActiveTrace {
  name: string;
  traceId?: string;
  end(): void;
  recordError(error: unknown): void;
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
        end() {
          return undefined;
        },
        recordError(_error: unknown) {
          return undefined;
        }
      };
    }
  };
}
