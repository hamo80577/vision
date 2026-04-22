import type {
  AuthResolution,
  AuthnErrorCode
} from "@vision/authn";
import type {
  ActiveTrace,
  ObservabilityContext,
  VisionLogger
} from "@vision/observability";
import type { ResolvedTenancyContext } from "@vision/tenancy";

declare module "fastify" {
  interface FastifyContextConfig {
    csrfProtected?: boolean;
  }

  interface FastifyRequest {
    activeTrace: ActiveTrace | null;
    observabilityContext: ObservabilityContext | null;
    requestLogger: VisionLogger | null;
    requestStartedAt: number | null;
    auth: AuthResolution | null;
    authFailure: AuthnErrorCode | null;
    tenancy: ResolvedTenancyContext | null;
  }
}

export {};
