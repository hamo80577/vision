import type { FastifyRequest } from "fastify";

import {
  ProblemError,
  createProblemDetails,
  getProblemDefinitionForStatus,
  isProblemError,
  sanitizeProblemInstance,
  type ObservabilityContext,
  type ProblemDetails,
  type ProblemValidationIssue
} from "@vision/observability";

type FastifyValidationIssue = {
  instancePath?: string;
  message?: string;
  keyword?: string;
  params?: {
    missingProperty?: string;
  };
};

type FastifyValidationError = {
  validation?: FastifyValidationIssue[];
  validationContext?: string;
};

type StatusCodeError = {
  statusCode?: number;
};

export type ApiProblemResult = {
  statusCode: number;
  problem: ProblemDetails;
};

function hasValidationErrors(error: unknown): error is FastifyValidationError {
  return Array.isArray((error as FastifyValidationError | undefined)?.validation);
}

function hasStatusCode(error: unknown): error is StatusCodeError {
  return typeof (error as StatusCodeError | undefined)?.statusCode === "number";
}

function trimPathSegment(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function getValidationPath(
  issue: FastifyValidationIssue,
  validationContext: string | undefined
): string {
  const basePath = trimPathSegment(issue.instancePath ?? "");
  const missingProperty =
    typeof issue.params?.missingProperty === "string"
      ? trimPathSegment(issue.params.missingProperty)
      : "";
  const context = trimPathSegment(validationContext ?? "");
  const parts = [context, basePath, missingProperty].filter(
    (part) => part.length > 0
  );

  return parts.join(".") || context || "body";
}

function mapValidationIssues(error: FastifyValidationError): ProblemValidationIssue[] {
  return (error.validation ?? []).map((issue) => ({
    path: getValidationPath(issue, error.validationContext),
    message: issue.message ?? "Invalid value.",
    code: issue.keyword
  }));
}

function getRequestInstance(request: FastifyRequest): string {
  return sanitizeProblemInstance(request.url);
}

function createProblemFromError(
  error: ProblemError,
  request: FastifyRequest,
  context: ObservabilityContext
): ApiProblemResult {
  return {
    statusCode: error.status,
    problem: createProblemDetails({
      type: error.type,
      title: error.title,
      status: error.status,
      code: error.code,
      detail: error.message,
      instance: getRequestInstance(request),
      traceId: context.traceId,
      errors: error.errors
    })
  };
}

function createValidationProblem(
  error: FastifyValidationError,
  request: FastifyRequest,
  context: ObservabilityContext
): ApiProblemResult {
  const definition = getProblemDefinitionForStatus(422);

  return {
    statusCode: definition.status,
    problem: createProblemDetails({
      ...definition,
      detail: "Request validation failed.",
      instance: getRequestInstance(request),
      traceId: context.traceId,
      errors: mapValidationIssues(error)
    })
  };
}

function createGenericProblem(
  error: unknown,
  request: FastifyRequest,
  context: ObservabilityContext
): ApiProblemResult {
  const definition = hasStatusCode(error)
    ? getProblemDefinitionForStatus(error.statusCode ?? 500)
    : getProblemDefinitionForStatus(500);
  const detail =
    definition.status === 500
      ? "An unexpected error occurred."
      : definition.title;

  return {
    statusCode: definition.status,
    problem: createProblemDetails({
      ...definition,
      detail,
      instance: getRequestInstance(request),
      traceId: context.traceId
    })
  };
}

export function mapApiErrorToProblem(
  error: unknown,
  request: FastifyRequest,
  context: ObservabilityContext
): ApiProblemResult {
  if (isProblemError(error)) {
    return createProblemFromError(error, request, context);
  }

  if (hasValidationErrors(error)) {
    return createValidationProblem(error, request, context);
  }

  return createGenericProblem(error, request, context);
}
