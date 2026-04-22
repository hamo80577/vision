import type { AuthResolution } from "@vision/authn";
import {
  authorize,
  requireAuthorization,
  type AuthorizationAction,
  type AuthorizationActorClaims,
  type AuthorizationContextFacts,
  type AuthorizationResource
} from "@vision/authz";
import type { FastifyRequest } from "fastify";

import { requireAuthenticatedRequest } from "./auth-request";

type RouteAuthorizationContextFacts = Omit<
  AuthorizationContextFacts,
  "activeTenantId" | "activeBranchId"
>;

export type AuthorizationGuardOptions = {
  resource: AuthorizationResource;
  action: AuthorizationAction;
  getActorClaims?: (
    request: FastifyRequest,
    auth: AuthResolution
  ) => AuthorizationActorClaims;
  getContextFacts: (
    request: FastifyRequest,
    auth: AuthResolution
  ) => RouteAuthorizationContextFacts;
};

function deriveDefaultActorClaims(auth: AuthResolution): AuthorizationActorClaims {
  if (auth.subject.subjectType === "customer") {
    return {
      actorType: "customer",
      subjectId: auth.subject.id,
      currentAssurance: auth.session.assuranceLevel
    };
  }

  return {
    actorType: "internal" as const,
    subjectId: auth.subject.id,
    currentAssurance: auth.session.assuranceLevel
  };
}

function deriveSessionContextFacts(
  request: FastifyRequest,
  auth: AuthResolution,
): AuthorizationContextFacts {
  if (request.tenancy) {
    return {
      activeTenantId: request.tenancy.activeTenantId,
      activeBranchId: request.tenancy.activeBranchId ?? undefined,
      targetTenantId: request.tenancy.targetTenantId,
      targetBranchId: request.tenancy.targetBranchId ?? undefined,
    };
  }

  return {
    activeTenantId: auth.session.activeTenantId ?? undefined,
    activeBranchId: auth.session.activeBranchId ?? undefined
  };
}

export function createAuthorizationGuard(options: AuthorizationGuardOptions) {
  return async function authorizationGuard(request: FastifyRequest) {
    const auth = requireAuthenticatedRequest(request);
    const actor =
      options.getActorClaims?.(request, auth) ?? deriveDefaultActorClaims(auth);
    const routeContext = options.getContextFacts(request, auth);
    const context = {
      ...routeContext,
      ...deriveSessionContextFacts(request, auth)
    };
    const decision = authorize({
      actor,
      resource: options.resource,
      action: options.action,
      context
    });

    requireAuthorization(decision);
  };
}
