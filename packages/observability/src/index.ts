export const observabilityPackageName = "@vision/observability" as const;

export {
  createObservabilityContext,
  extendObservabilityContext,
  type ObservabilityContext,
  type ObservabilityContextInput
} from "./context";
export {
  ProblemError,
  getProblemDefinitionForStatus,
  isProblemError,
  serializeErrorForLog,
  type ProblemDefinition,
  type ProblemErrorOptions
} from "./errors";
export {
  createObservabilityId,
  isSafeObservabilityId,
  sanitizeObservabilityId
} from "./ids";
export {
  createLogger,
  type Clock,
  type CreateLoggerOptions,
  type LogLevel,
  type LogMetadata,
  type LogSink,
  type VisionLogger
} from "./logger";
export {
  createProblemDetails,
  sanitizeProblemInstance,
  type ProblemCode,
  type ProblemDenialReason,
  type ProblemDetails,
  type ProblemDetailsInput,
  type ProblemRequiredAssurance,
  type ProblemValidationIssue
} from "./problem-details";
export {
  createNoopTracer,
  type ActiveTrace,
  type ObservabilityTracer
} from "./tracing";
