import { createObservabilityId, sanitizeObservabilityId } from "./ids";

export interface ObservabilityContext {
  requestId: string;
  correlationId: string;
  traceId?: string;
  subject?: string;
  tenant?: string;
  branch?: string;
  service?: string;
  environment?: string;
}

export type ObservabilityContextInput = Partial<ObservabilityContext>;

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createObservabilityContext(
  incoming: ObservabilityContextInput = {}
): ObservabilityContext {
  const requestId = sanitizeObservabilityId(incoming.requestId) ?? createObservabilityId();
  const correlationId = sanitizeObservabilityId(incoming.correlationId) ?? requestId;

  return {
    requestId,
    correlationId,
    traceId: sanitizeObservabilityId(incoming.traceId),
    subject: normalizeOptionalString(incoming.subject),
    tenant: normalizeOptionalString(incoming.tenant),
    branch: normalizeOptionalString(incoming.branch),
    service: normalizeOptionalString(incoming.service),
    environment: normalizeOptionalString(incoming.environment)
  };
}

export function extendObservabilityContext(
  base: ObservabilityContext,
  overrides: ObservabilityContextInput = {}
): ObservabilityContext {
  return {
    requestId: base.requestId,
    correlationId: base.correlationId,
    traceId: sanitizeObservabilityId(overrides.traceId) ?? base.traceId,
    subject: normalizeOptionalString(overrides.subject) ?? normalizeOptionalString(base.subject),
    tenant: normalizeOptionalString(overrides.tenant) ?? normalizeOptionalString(base.tenant),
    branch: normalizeOptionalString(overrides.branch) ?? normalizeOptionalString(base.branch),
    service: normalizeOptionalString(overrides.service) ?? normalizeOptionalString(base.service),
    environment:
      normalizeOptionalString(overrides.environment) ??
      normalizeOptionalString(base.environment)
  };
}
