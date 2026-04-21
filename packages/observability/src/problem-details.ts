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
  detail: string;
  instance: string;
  traceId?: string;
  errors?: ProblemValidationIssue[];
}

export type ProblemDetailsInput = Omit<ProblemDetails, "instance"> & {
  instance?: string;
};

function sanitizeAuthorityLikePath(value: string): string {
  const withoutLeadingSlashes = value.replace(/^\/+/, "");
  const firstPathSeparator = withoutLeadingSlashes.indexOf("/");

  if (firstPathSeparator === -1) {
    return "/";
  }

  return withoutLeadingSlashes.slice(firstPathSeparator);
}

export function sanitizeProblemInstance(value: string | undefined): string {
  if (typeof value !== "string") {
    return "/";
  }

  const input = value.trim();
  if (input.length === 0) {
    return "/";
  }

  let pathOnly: string;

  try {
    const parsed = new URL(input);
    pathOnly = parsed.pathname;
  } catch {
    const withoutQueryOrHash = input.split("?")[0]?.split("#")[0] ?? "";
    pathOnly = withoutQueryOrHash.startsWith("//")
      ? sanitizeAuthorityLikePath(withoutQueryOrHash)
      : withoutQueryOrHash;
  }

  if (pathOnly.length === 0) {
    return "/";
  }

  return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
}

export function createProblemDetails(input: ProblemDetailsInput): ProblemDetails {
  const next: ProblemDetails = {
    type: input.type,
    title: input.title,
    status: input.status,
    code: input.code,
    detail: input.detail,
    instance: sanitizeProblemInstance(input.instance)
  };

  const traceId = sanitizeObservabilityId(input.traceId);
  if (traceId !== undefined) {
    next.traceId = traceId;
  }

  if (input.code === "validation_error" && input.errors !== undefined) {
    next.errors = input.errors;
  }

  return next;
}
