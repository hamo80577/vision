import { sanitizeObservabilityId } from "./ids";

export type ProblemCode =
  | "internal_error"
  | "validation_error"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict";

export interface ProblemValidationIssue {
  path: string;
  message: string;
  code?: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail?: string;
  instance?: string;
  traceId?: string;
  issues?: ProblemValidationIssue[];
}

export type ProblemDetailsInput = Omit<ProblemDetails, "instance"> & {
  instance?: string;
};

export function sanitizeProblemInstance(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const input = value.trim();
  if (input.length === 0) {
    return undefined;
  }

  let pathOnly: string;

  try {
    const parsed = new URL(input);
    pathOnly = parsed.pathname;
  } catch {
    pathOnly = input.split("?")[0]?.split("#")[0] ?? "";
  }

  if (pathOnly.length === 0) {
    return undefined;
  }

  return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
}

export function createProblemDetails(input: ProblemDetailsInput): ProblemDetails {
  const next: ProblemDetails = {
    type: input.type,
    title: input.title,
    status: input.status,
    code: input.code
  };

  if (input.detail !== undefined) {
    next.detail = input.detail;
  }

  const instance = sanitizeProblemInstance(input.instance);
  if (instance !== undefined) {
    next.instance = instance;
  }

  const traceId = sanitizeObservabilityId(input.traceId);
  if (traceId !== undefined) {
    next.traceId = traceId;
  }

  if (input.issues !== undefined) {
    next.issues = input.issues;
  }

  return next;
}
