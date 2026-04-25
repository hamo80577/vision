import { ZodError, type ZodType } from "zod";

import {
  ProblemError,
  getProblemDefinitionForStatus,
  type ProblemValidationIssue,
} from "@vision/observability";

function formatZodPath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return "body";
  }

  return ["body", ...path.map(String)].join(".");
}

function mapZodIssues(error: ZodError): ProblemValidationIssue[] {
  return error.issues.map((issue) => ({
    path: formatZodPath(issue.path),
    message: issue.message,
    code: issue.code,
  }));
}

export function parseRequestBody<TOutput>(schema: ZodType<TOutput>, value: unknown): TOutput {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const definition = getProblemDefinitionForStatus(422);

      throw new ProblemError({
        ...definition,
        detail: "Request validation failed.",
        errors: mapZodIssues(error),
      });
    }

    throw error;
  }
}
