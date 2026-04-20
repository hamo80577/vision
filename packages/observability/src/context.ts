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

export function createObservabilityContext(
  incoming: Partial<ObservabilityContext> = {}
): ObservabilityContext {
  const requestId = sanitizeObservabilityId(incoming.requestId) ?? createObservabilityId();
  const correlationId = sanitizeObservabilityId(incoming.correlationId) ?? requestId;

  return {
    requestId,
    correlationId,
    traceId: sanitizeObservabilityId(incoming.traceId),
    subject: incoming.subject,
    tenant: incoming.tenant,
    branch: incoming.branch,
    service: incoming.service,
    environment: incoming.environment
  };
}

export function extendObservabilityContext(
  base: ObservabilityContext,
  overrides: Partial<ObservabilityContext> = {}
): ObservabilityContext {
  const requestId = sanitizeObservabilityId(overrides.requestId) ?? base.requestId;
  const correlationId =
    sanitizeObservabilityId(overrides.correlationId) ?? base.correlationId;
  const traceId =
    sanitizeObservabilityId(overrides.traceId) ?? base.traceId;

  return {
    requestId,
    correlationId,
    traceId,
    subject: overrides.subject ?? base.subject,
    tenant: overrides.tenant ?? base.tenant,
    branch: overrides.branch ?? base.branch,
    service: overrides.service ?? base.service,
    environment: overrides.environment ?? base.environment
  };
}
