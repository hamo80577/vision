import type { ProblemCode, ProblemDetails } from "./problem-details";

export interface ProblemDefinition {
  status: 401 | 403 | 404 | 409 | 422 | 500;
  code: ProblemCode;
  title: string;
  type: string;
}

const PROBLEM_DEFINITIONS: Record<ProblemDefinition["status"], ProblemDefinition> = {
  401: {
    status: 401,
    code: "unauthenticated",
    title: "Unauthenticated",
    type: "urn:vision:problem:unauthenticated"
  },
  403: {
    status: 403,
    code: "forbidden",
    title: "Forbidden",
    type: "urn:vision:problem:forbidden"
  },
  404: {
    status: 404,
    code: "not_found",
    title: "Not Found",
    type: "urn:vision:problem:not_found"
  },
  409: {
    status: 409,
    code: "conflict",
    title: "Conflict",
    type: "urn:vision:problem:conflict"
  },
  422: {
    status: 422,
    code: "validation_error",
    title: "Validation Error",
    type: "urn:vision:problem:validation_error"
  },
  500: {
    status: 500,
    code: "internal_error",
    title: "Internal Error",
    type: "urn:vision:problem:internal_error"
  }
};

const PROBLEM_ERROR_NAME = "ProblemError";

export function getProblemDefinitionForStatus(status: number): ProblemDefinition {
  if (status in PROBLEM_DEFINITIONS) {
    return PROBLEM_DEFINITIONS[status as ProblemDefinition["status"]];
  }

  return PROBLEM_DEFINITIONS[500];
}

export class ProblemError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = PROBLEM_ERROR_NAME;
    this.problem = problem;
  }
}

export function isProblemError(value: unknown): value is ProblemError {
  return value instanceof ProblemError;
}

export function serializeErrorForLog(error: unknown): Record<string, unknown> {
  if (isProblemError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.problem.code,
      status: error.problem.status
    };
  }

  if (error instanceof Error) {
    const candidate = error as Error & {
      code?: unknown;
      status?: unknown;
    };

    const serialized: Record<string, unknown> = {
      name: candidate.name,
      message: candidate.message
    };

    if (typeof candidate.code === "string") {
      serialized.code = candidate.code;
    }

    if (typeof candidate.status === "number") {
      serialized.status = candidate.status;
    }

    return serialized;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const serialized: Record<string, unknown> = {};

    if (typeof record.name === "string") {
      serialized.name = record.name;
    }

    if (typeof record.message === "string") {
      serialized.message = record.message;
    }

    if (typeof record.code === "string") {
      serialized.code = record.code;
    }

    if (typeof record.status === "number") {
      serialized.status = record.status;
    }

    return serialized;
  }

  return {
    message: String(error)
  };
}
