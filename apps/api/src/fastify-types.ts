import type {
  ActiveTrace,
  ObservabilityContext,
  VisionLogger
} from "@vision/observability";

declare module "fastify" {
  interface FastifyRequest {
    activeTrace: ActiveTrace | null;
    observabilityContext: ObservabilityContext | null;
    requestLogger: VisionLogger | null;
    requestStartedAt: number | null;
  }
}

export {};
