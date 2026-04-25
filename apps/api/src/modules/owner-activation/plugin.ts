import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { ProblemError } from "@vision/observability";
import {
  type CompleteOwnerActivationInput,
} from "@vision/validation";
import { completeOwnerActivationInputSchema } from "@vision/validation";
import { closeDatabasePool, createRuntimeDatabase } from "@vision/db";

import { parseRequestBody } from "../../zod-validation";
import type { ApiRuntimeConfig } from "../../runtime";
import { isOwnerActivationError } from "./errors";
import {
  createOwnerActivationService,
  type OwnerActivationService,
} from "./service";

type OwnerActivationPluginOptions = {
  runtime: ApiRuntimeConfig;
  ownerActivationService?: OwnerActivationService;
};

const activationParamsSchema = {
  params: {
    type: "object",
    required: ["activationToken"],
    additionalProperties: false,
    properties: {
      activationToken: { type: "string", minLength: 1 },
    },
  },
} as const;

function toProblemError(error: unknown): never {
  if (!isOwnerActivationError(error)) {
    throw error;
  }

  if (error.code === "activation_link_invalid") {
    throw new ProblemError({
      status: 404,
      code: "activation_link_invalid",
      title: "Not Found",
      type: "https://vision.local/problems/activation-link-invalid",
      detail: error.message,
    });
  }

  if (
    error.code === "activation_link_expired" ||
    error.code === "activation_link_revoked" ||
    error.code === "activation_link_consumed"
  ) {
    throw new ProblemError({
      status: 409,
      code: error.code,
      title: "Conflict",
      type: "https://vision.local/problems/activation-link-conflict",
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

const ownerActivationPluginImpl: FastifyPluginAsync<
  OwnerActivationPluginOptions
> = async (api, options) => {
  const runtimeDatabase = options.ownerActivationService
    ? null
    : createRuntimeDatabase({
        appEnv: options.runtime.appEnv,
        databaseUrl: options.runtime.databaseUrl,
      });
  const service =
    options.ownerActivationService ??
    createOwnerActivationService({
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
    "/owner-activation/:activationToken",
    {
      schema: activationParamsSchema,
    },
    async (request) => {
      try {
        return await service.validateActivationToken({
          activationToken: (request.params as { activationToken: string }).activationToken,
        });
      } catch (error) {
        toProblemError(error);
      }
    },
  );

  api.post(
    "/owner-activation/:activationToken/complete",
    {
      schema: activationParamsSchema,
    },
    async (request) => {
      const payload = parseRequestBody<CompleteOwnerActivationInput>(
        completeOwnerActivationInputSchema,
        request.body,
      );

      try {
        return await service.completeActivation({
          activationToken: (request.params as { activationToken: string }).activationToken,
          password: payload.password,
          passwordConfirmation: payload.passwordConfirmation,
        });
      } catch (error) {
        toProblemError(error);
      }
    },
  );
};

export const ownerActivationPlugin = fp(ownerActivationPluginImpl, {
  name: "owner-activation-plugin",
});
