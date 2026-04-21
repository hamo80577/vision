import {
  createProblemDetails,
  type ProblemCode,
  type ProblemDenialReason,
  type ProblemDetails,
  type ProblemRequiredAssurance
} from "./problem-details";

export interface ProblemDefinition {
  status: 401 | 403 | 404 | 409 | 422 | 500;
  code: ProblemCode;
  title: string;
  type: string;
}

export type ProblemErrorOptions = ProblemDefinition & {
  detail: string;
  instance?: string;
  traceId?: string;
  requiredAssurance?: ProblemRequiredAssurance;
  denialReason?: ProblemDenialReason;
  errors?: ProblemDetails["errors"];
};

const PROBLEM_BASE_URL = "https://vision.local/problems";

const PROBLEM_DEFINITIONS: Record<ProblemDefinition["status"], ProblemDefinition> = {
  401: {
    status: 401,
    code: "unauthenticated",
    title: "Unauthenticated",
    type: `${PROBLEM_BASE_URL}/unauthenticated`
  },
  403: {
    status: 403,
    code: "forbidden",
    title: "Forbidden",
    type: `${PROBLEM_BASE_URL}/forbidden`
  },
  404: {
    status: 404,
    code: "not_found",
    title: "Not Found",
    type: `${PROBLEM_BASE_URL}/not-found`
  },
  409: {
    status: 409,
    code: "conflict",
    title: "Conflict",
    type: `${PROBLEM_BASE_URL}/conflict`
  },
  422: {
    status: 422,
    code: "validation_error",
    title: "Validation Error",
    type: `${PROBLEM_BASE_URL}/validation-error`
  },
  500: {
    status: 500,
    code: "internal_error",
    title: "Internal Server Error",
    type: `${PROBLEM_BASE_URL}/internal-error`
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
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: ProblemCode;
  readonly requiredAssurance?: ProblemRequiredAssurance;
  readonly denialReason?: ProblemDenialReason;
  readonly errors?: ProblemDetails["errors"];
  readonly problem: ProblemDetails;

  constructor(options: ProblemErrorOptions) {
    super(options.detail);
    this.name = PROBLEM_ERROR_NAME;
    this.type = options.type;
    this.title = options.title;
    this.status = options.status;
    this.code = options.code;
    this.requiredAssurance = options.requiredAssurance;
    this.denialReason = options.denialReason;
    this.errors = options.code === "validation_error" ? options.errors : undefined;
    this.problem = createProblemDetails({
      type: options.type,
      title: options.title,
      status: options.status,
      code: options.code,
      detail: options.detail,
      instance: options.instance,
      requiredAssurance: options.requiredAssurance,
      denialReason: options.denialReason,
      traceId: options.traceId,
      errors: this.errors
    });
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
      code: error.code,
      status: error.status,
      requiredAssurance: error.requiredAssurance,
      denialReason: error.denialReason
    };
  }

  if (error instanceof Error) {
    const candidate = error as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      requiredAssurance?: unknown;
      denialReason?: unknown;
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

    if (typeof candidate.statusCode === "number") {
      serialized.statusCode = candidate.statusCode;
    }

    if (
      candidate.requiredAssurance === "basic" ||
      candidate.requiredAssurance === "mfa_verified" ||
      candidate.requiredAssurance === "step_up_verified"
    ) {
      serialized.requiredAssurance = candidate.requiredAssurance;
    }

    if (
      candidate.denialReason === "mfa_required" ||
      candidate.denialReason === "step_up_required" ||
      candidate.denialReason === "step_up_stale"
    ) {
      serialized.denialReason = candidate.denialReason;
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

    if (typeof record.statusCode === "number") {
      serialized.statusCode = record.statusCode;
    }

    if (
      record.requiredAssurance === "basic" ||
      record.requiredAssurance === "mfa_verified" ||
      record.requiredAssurance === "step_up_verified"
    ) {
      serialized.requiredAssurance = record.requiredAssurance;
    }

    if (
      record.denialReason === "mfa_required" ||
      record.denialReason === "step_up_required" ||
      record.denialReason === "step_up_stale"
    ) {
      serialized.denialReason = record.denialReason;
    }

    return serialized;
  }

  return {
    message: String(error)
  };
}
