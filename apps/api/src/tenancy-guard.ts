import type { AuthResolution } from "@vision/authn";
import { extendObservabilityContext } from "@vision/observability";
import {
  TenancyError,
  resolveInternalTenancyContext,
  type ActiveTenantAccessSnapshot,
  type RawRouteIntent,
} from "@vision/tenancy";
import type { FastifyRequest } from "fastify";

import { requireAuthenticatedRequest } from "./auth-request";

export type TenancyGuardOptions = {
  getRouteIntent: (request: FastifyRequest, auth: AuthResolution) => RawRouteIntent;
  getAccessSnapshot: (
    request: FastifyRequest,
    auth: AuthResolution,
  ) => ActiveTenantAccessSnapshot | Promise<ActiveTenantAccessSnapshot | null> | null;
};

export function createTenancyGuard(options: TenancyGuardOptions) {
  return async function tenancyGuard(request: FastifyRequest) {
    const auth = requireAuthenticatedRequest(request);

    if (auth.subject.subjectType !== "internal") {
      throw new TenancyError("unsupported_execution_surface");
    }

    const tenancy = resolveInternalTenancyContext({
      routeIntent: options.getRouteIntent(request, auth),
      session: {
        sessionId: auth.session.sessionId,
        subjectId: auth.subject.id,
        subjectType: "internal",
        activeTenantId: auth.session.activeTenantId,
        activeBranchId: auth.session.activeBranchId,
      },
      access: await options.getAccessSnapshot(request, auth),
    });

    request.tenancy = tenancy;

    if (request.observabilityContext) {
      request.observabilityContext = extendObservabilityContext(
        request.observabilityContext,
        {
          subject: tenancy.subjectId,
          tenant: tenancy.targetTenantId,
          branch: tenancy.targetBranchId ?? undefined,
        },
      );
      request.requestLogger = request.requestLogger?.child(request.observabilityContext) ?? null;
    }
  };
}
