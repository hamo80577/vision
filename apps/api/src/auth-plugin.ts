import fastifyCookie from "@fastify/cookie";
import type { FastifyPluginAsync } from "fastify";

import {
  AuthnError,
  createAuthnService,
  isAuthnError,
  type AuthResolution,
  type AuthnService,
} from "@vision/authn";
import { closeDatabasePool, createRuntimeDatabase } from "@vision/db";
import { ProblemError, getProblemDefinitionForStatus } from "@vision/observability";

import type { ApiRuntimeConfig } from "./runtime";
import {
  clearAuthCookie,
  readAuthCookie,
  setAuthCookie,
} from "./auth-cookie";

type AuthPluginOptions = {
  runtime: ApiRuntimeConfig;
  authService?: AuthnService;
};

type RequestWithAuth = {
  auth: AuthResolution | null;
  authFailure: AuthnError["code"] | null;
};

function unauthenticated(detail: string): ProblemError {
  return new ProblemError({
    ...getProblemDefinitionForStatus(401),
    detail,
  });
}

function insufficientAssurance(error: AuthnError): ProblemError {
  return new ProblemError({
    status: 403,
    code: "insufficient_assurance",
    title: "Insufficient Assurance",
    type: "https://vision.local/problems/insufficient-assurance",
    detail: error.message,
    requiredAssurance: error.context.requiredAssurance,
    denialReason: error.context.denialReason,
  });
}

function getAuthFailureDetail(code: AuthnError["code"] | null): string {
  switch (code) {
    case "invalid_credentials":
      return "Invalid login credentials.";
    case "expired_session":
      return "Session has expired.";
    case "revoked_session":
      return "Session has been revoked.";
    default:
      return "Authentication required.";
  }
}

function requireAuth(request: RequestWithAuth): AuthResolution {
  if (request.auth) {
    return request.auth;
  }

  throw unauthenticated(getAuthFailureDetail(request.authFailure));
}

function mapAuthnError(error: AuthnError): never {
  if (error.code === "insufficient_assurance") {
    throw insufficientAssurance(error);
  }

  if (
    error.code === "invalid_assurance_challenge" ||
    error.code === "expired_assurance_challenge" ||
    error.code === "consumed_assurance_challenge" ||
    error.code === "invalid_totp_code" ||
    error.code === "invalid_backup_code"
  ) {
    throw new ProblemError({
      type: "https://vision.local/problems/validation-error",
      title: "Validation Error",
      status: 422,
      code: "validation_error",
      detail: error.message,
    });
  }

  throw unauthenticated(getAuthFailureDetail(error.code));
}

function getRuntimeDatabase(options: AuthPluginOptions) {
  if (options.authService) {
    return null;
  }

  return createRuntimeDatabase({
    appEnv: options.runtime.appEnv,
    databaseUrl: options.runtime.databaseUrl,
  });
}

export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  api,
  options,
) => {
  await api.register(fastifyCookie);

  const runtimeDatabase = getRuntimeDatabase(options);
  const authService =
    options.authService ??
    createAuthnService(
      (() => {
        if (!runtimeDatabase) {
          throw new Error("Expected runtime database when authService is not provided.");
        }

        return runtimeDatabase.db;
      })(),
      {
        mfaEncryptionKey: options.runtime.mfaEncryptionKey,
        mfaEncryptionKeyVersion: options.runtime.mfaEncryptionKeyVersion,
      },
    );

  if (runtimeDatabase) {
    api.addHook("onClose", async () => {
      await closeDatabasePool(runtimeDatabase.pool);
    });
  }

  api.decorateRequest("auth", null);
  api.decorateRequest("authFailure", null);

  api.addHook("onRequest", async (request) => {
    const token = readAuthCookie(request);

    request.auth = null;
    request.authFailure = null;

    if (!token) {
      return;
    }

    try {
      request.auth = await authService.resolveSession({ token });
    } catch (error) {
      if (isAuthnError(error)) {
        request.authFailure = error.code;
        return;
      }

      throw error;
    }
  });

  const loginSchema = {
    body: {
      type: "object",
      required: ["loginIdentifier", "password"],
      additionalProperties: false,
      properties: {
        loginIdentifier: { type: "string", minLength: 1 },
        password: { type: "string", minLength: 1 },
      },
    },
  } as const;

  api.post("/auth/customer/login", { schema: loginSchema }, async (request, reply) => {
    try {
      const body = request.body as { loginIdentifier: string; password: string };
      const result = await authService.login({
        subjectType: "customer",
        loginIdentifier: body.loginIdentifier,
        password: body.password,
      });

      if (result.kind !== "session") {
        throw new Error("Customer login must not require MFA.");
      }

      setAuthCookie(
        reply,
        options.runtime.appEnv,
        result.sessionToken,
        result.session.expiresAt,
      );

      return {
        subject: result.subject,
        session: result.session,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/login", { schema: loginSchema }, async (request, reply) => {
    try {
      const body = request.body as { loginIdentifier: string; password: string };
      const result = await authService.login({
        subjectType: "internal",
        loginIdentifier: body.loginIdentifier,
        password: body.password,
      });

      if (result.kind === "mfa_challenge") {
        reply.code(202);
        return result;
      }

      setAuthCookie(reply, options.runtime.appEnv, result.sessionToken, result.session.expiresAt);

      return {
        subject: result.subject,
        session: result.session,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/enrollment/start", async (request) => {
    try {
      const body = request.body as { challengeToken: string; accountName: string };
      return authService.startMfaEnrollment(body);
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/enrollment/verify", async (request, reply) => {
    try {
      const body = request.body as { challengeToken: string; code: string };
      const result = await authService.verifyMfaEnrollment(body);

      setAuthCookie(reply, options.runtime.appEnv, result.sessionToken, result.session.expiresAt);
      return {
        subject: result.subject,
        session: result.session,
        backupCodes: result.backupCodes,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/verify", async (request, reply) => {
    try {
      const body = request.body as {
        challengeToken: string;
        code?: string;
        backupCode?: string;
      };
      const result = await authService.verifyMfaChallenge({
        challengeToken: body.challengeToken,
        totpCode: body.code,
        backupCode: body.backupCode,
      });

      setAuthCookie(reply, options.runtime.appEnv, result.sessionToken, result.session.expiresAt);
      return {
        subject: result.subject,
        session: result.session,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/assurance/step-up/start", async (request) => {
    const token = readAuthCookie(request);

    if (!token) {
      throw unauthenticated("Authentication required.");
    }

    try {
      const body = request.body as { reason: string };
      return await authService.startStepUpChallenge({
        token,
        reason: body.reason as
          | "tenant_context_switch"
          | "support_grant_activation"
          | "website_management_write"
          | "data_export"
          | "credential_reset",
      });
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/assurance/step-up/verify", async (request) => {
    const token = readAuthCookie(request);

    if (!token) {
      throw unauthenticated("Authentication required.");
    }

    try {
      const body = request.body as {
        challengeToken: string;
        code?: string;
        backupCode?: string;
      };
      const result = await authService.verifyStepUpChallenge({
        token,
        challengeToken: body.challengeToken,
        totpCode: body.code,
        backupCode: body.backupCode,
      });

      return {
        subject: result.subject,
        session: result.session,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/backup-codes/regenerate", async (request) => {
    const token = readAuthCookie(request);

    if (!token) {
      throw unauthenticated("Authentication required.");
    }

    try {
      const backupCodes = await authService.regenerateBackupCodes({ token });
      return { backupCodes };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.get("/auth/session", async (request, reply) => {
    try {
      return requireAuth(request);
    } catch (error) {
      clearAuthCookie(reply, options.runtime.appEnv);
      throw error;
    }
  });

  api.post("/auth/logout", async (request, reply) => {
    const token = readAuthCookie(request);

    if (!token) {
      clearAuthCookie(reply, options.runtime.appEnv);
      throw unauthenticated("Authentication required.");
    }

    try {
      await authService.logout({ token });
      clearAuthCookie(reply, options.runtime.appEnv);
      reply.code(204);
      return reply.send();
    } catch (error) {
      clearAuthCookie(reply, options.runtime.appEnv);

      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });
};
