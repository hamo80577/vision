import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import type { AuthResolution } from "@vision/authn";
import { type AuthorizationActorClaims } from "@vision/authz";
import { createRuntimeDatabase, closeDatabasePool } from "@vision/db";
import { ProblemError } from "@vision/observability";
import {
  type CreateTenantInput,
  type UpdateTenantEntitlementsInput,
  type UpdateTenantSubscriptionInput,
} from "@vision/contracts";
import {
  createTenantInputSchema,
  updateTenantEntitlementsInputSchema,
  updateTenantSubscriptionInputSchema,
} from "@vision/validation";

import { createAuthorizationGuard } from "../../authz-guard";
import type { ApiRuntimeConfig } from "../../runtime";
import { requireAuthenticatedRequest } from "../../auth-request";
import { parseRequestBody } from "../../zod-validation";
import { isPlatformProvisioningError } from "./errors";
import { createPlatformProvisioningService, type PlatformProvisioningService } from "./service";

type PlatformProvisioningPluginOptions = {
  runtime: ApiRuntimeConfig;
  platformProvisioningService?: PlatformProvisioningService;
};

const tenantParamsSchema = {
  params: {
    type: "object",
    required: ["tenantId"],
    additionalProperties: false,
    properties: {
      tenantId: { type: "string", minLength: 1 },
    },
  },
} as const;

const csrfProtectedConfig = {
  config: {
    csrfProtected: true,
  },
} as const;

const emptyMutationBodySchema = {
  body: {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        maxProperties: 0,
      },
      {
        type: "null",
      },
    ],
  },
} as const;

function getPlatformActorClaims(auth: AuthResolution): AuthorizationActorClaims {
  if (auth.subject.subjectType === "customer") {
    return {
      actorType: "customer",
      subjectId: auth.subject.id,
      currentAssurance: auth.session.assuranceLevel,
    };
  }

  return {
    actorType: "internal",
    subjectId: auth.subject.id,
    currentAssurance: auth.session.assuranceLevel,
    platformRole:
      auth.subject.internalSensitivity === "platform_admin" ? "platform_admin" : undefined,
  };
}

function toProblemError(error: unknown): never {
  if (!isPlatformProvisioningError(error)) {
    throw error;
  }

  if (error.code === "tenant_not_found") {
    throw new ProblemError({
      status: 404,
      code: "not_found",
      title: "Not Found",
      type: "https://vision.local/problems/not-found",
      detail: error.message,
    });
  }

  throw new ProblemError({
    status: 409,
    code: "conflict",
    title: "Conflict",
    type: "https://vision.local/problems/conflict",
    detail: error.message,
  });
}

const platformProvisioningPluginImpl: FastifyPluginAsync<
  PlatformProvisioningPluginOptions
> = async (api, options) => {
  const runtimeDatabase = options.platformProvisioningService
    ? null
    : createRuntimeDatabase({
        appEnv: options.runtime.appEnv,
        databaseUrl: options.runtime.databaseUrl,
      });
  const service =
    options.platformProvisioningService ??
    createPlatformProvisioningService({
      db: (() => {
        if (!runtimeDatabase) {
          throw new Error("Expected runtime database when service is not provided.");
        }

        return runtimeDatabase.db;
      })(),
    });

  if (runtimeDatabase) {
    api.addHook("onClose", async () => {
      await closeDatabasePool(runtimeDatabase.pool);
    });
  }

  api.get(
    "/platform/tenants",
    {
      preHandler: [
        createAuthorizationGuard({
          resource: { family: "platform_tenant_management" },
          action: "list",
          getActorClaims: (_request, auth) => getPlatformActorClaims(auth),
          getContextFacts: () => ({
            platformProvisioningOperation: "list_tenants",
          }),
        }),
      ],
    },
    async () => service.listTenants(),
  );

  api.post(
    "/platform/tenants",
    {
      ...csrfProtectedConfig,
      preHandler: [
        createAuthorizationGuard({
          resource: { family: "platform_tenant_management" },
          action: "create",
          getActorClaims: (_request, auth) => getPlatformActorClaims(auth),
          getContextFacts: () => ({
            platformProvisioningOperation: "create_tenant",
          }),
        }),
      ],
    },
    async (request, reply) => {
      const auth = requireAuthenticatedRequest(request);
      const payload = parseRequestBody<CreateTenantInput>(createTenantInputSchema, request.body);

      try {
        const result = await service.createTenant({
          actorSubjectId: auth.subject.id,
          payload,
        });

        reply.code(201);
        return result;
      } catch (error) {
        toProblemError(error);
      }
    },
  );

  api.get(
    "/platform/tenants/:tenantId",
    {
      ...tenantParamsSchema,
      preHandler: [
        createAuthorizationGuard({
          resource: { family: "platform_tenant_management" },
          action: "read",
          getActorClaims: (_request, auth) => getPlatformActorClaims(auth),
          getContextFacts: (request) => ({
            targetTenantId: (request.params as { tenantId: string }).tenantId,
            platformProvisioningOperation: "read_tenant",
          }),
        }),
      ],
    },
    async (request) => {
      try {
        return await service.getTenantDetail({
          tenantId: (request.params as { tenantId: string }).tenantId,
        });
      } catch (error) {
        toProblemError(error);
      }
    },
  );

  api.put(
    "/platform/tenants/:tenantId/subscription",
    {
      ...csrfProtectedConfig,
      ...tenantParamsSchema,
      preHandler: [
        createAuthorizationGuard({
          resource: { family: "platform_tenant_management" },
          action: "update",
          getActorClaims: (_request, auth) => getPlatformActorClaims(auth),
          getContextFacts: (request) => ({
            targetTenantId: (request.params as { tenantId: string }).tenantId,
            platformProvisioningOperation: "update_subscription",
          }),
        }),
      ],
    },
    async (request) => {
      const auth = requireAuthenticatedRequest(request);
      const payload = parseRequestBody<UpdateTenantSubscriptionInput>(
        updateTenantSubscriptionInputSchema,
        request.body,
      );

      try {
        return await service.updateTenantSubscription({
          actorSubjectId: auth.subject.id,
          tenantId: (request.params as { tenantId: string }).tenantId,
          payload,
        });
      } catch (error) {
        toProblemError(error);
      }
    },
  );

  api.put(
    "/platform/tenants/:tenantId/entitlements",
    {
      ...csrfProtectedConfig,
      ...tenantParamsSchema,
      preHandler: [
        createAuthorizationGuard({
          resource: { family: "platform_tenant_management" },
          action: "update",
          getActorClaims: (_request, auth) => getPlatformActorClaims(auth),
          getContextFacts: (request) => ({
            targetTenantId: (request.params as { tenantId: string }).tenantId,
            platformProvisioningOperation: "update_entitlements",
          }),
        }),
      ],
    },
    async (request) => {
      const auth = requireAuthenticatedRequest(request);
      const payload = parseRequestBody<UpdateTenantEntitlementsInput>(
        updateTenantEntitlementsInputSchema,
        request.body,
      );

      try {
        return await service.updateTenantEntitlements({
          actorSubjectId: auth.subject.id,
          tenantId: (request.params as { tenantId: string }).tenantId,
          payload,
        });
      } catch (error) {
        toProblemError(error);
      }
    },
  );

  api.post(
    "/platform/tenants/:tenantId/activate",
    {
      ...csrfProtectedConfig,
      ...emptyMutationBodySchema,
      ...tenantParamsSchema,
      preHandler: [
        createAuthorizationGuard({
          resource: { family: "platform_tenant_management" },
          action: "change_status",
          getActorClaims: (_request, auth) => getPlatformActorClaims(auth),
          getContextFacts: (request) => ({
            targetTenantId: (request.params as { tenantId: string }).tenantId,
            platformProvisioningOperation: "activate_tenant",
          }),
        }),
      ],
    },
    async (request) => {
      const auth = requireAuthenticatedRequest(request);

      try {
        return await service.activateTenant({
          actorSubjectId: auth.subject.id,
          tenantId: (request.params as { tenantId: string }).tenantId,
        });
      } catch (error) {
        toProblemError(error);
      }
    },
  );

  api.post(
    "/platform/tenants/:tenantId/suspend",
    {
      ...csrfProtectedConfig,
      ...emptyMutationBodySchema,
      ...tenantParamsSchema,
      preHandler: [
        createAuthorizationGuard({
          resource: { family: "platform_tenant_management" },
          action: "change_status",
          getActorClaims: (_request, auth) => getPlatformActorClaims(auth),
          getContextFacts: (request) => ({
            targetTenantId: (request.params as { tenantId: string }).tenantId,
            platformProvisioningOperation: "suspend_tenant",
          }),
        }),
      ],
    },
    async (request) => {
      const auth = requireAuthenticatedRequest(request);

      try {
        return await service.suspendTenant({
          actorSubjectId: auth.subject.id,
          tenantId: (request.params as { tenantId: string }).tenantId,
        });
      } catch (error) {
        toProblemError(error);
      }
    },
  );

  api.post(
    "/platform/tenants/:tenantId/owner-onboarding-links",
    {
      ...csrfProtectedConfig,
      ...emptyMutationBodySchema,
      ...tenantParamsSchema,
      preHandler: [
        createAuthorizationGuard({
          resource: { family: "platform_tenant_management" },
          action: "create",
          getActorClaims: (_request, auth) => getPlatformActorClaims(auth),
          getContextFacts: (request) => ({
            targetTenantId: (request.params as { tenantId: string }).tenantId,
            platformProvisioningOperation: "issue_onboarding_link",
          }),
        }),
      ],
    },
    async (request, reply) => {
      const auth = requireAuthenticatedRequest(request);

      try {
        const result = await service.issueOwnerOnboardingLink({
          actorSubjectId: auth.subject.id,
          tenantId: (request.params as { tenantId: string }).tenantId,
        });

        reply.code(201);
        return result;
      } catch (error) {
        toProblemError(error);
      }
    },
  );
};

export const platformProvisioningPlugin = fp(platformProvisioningPluginImpl, {
  name: "platform-provisioning-plugin",
});
