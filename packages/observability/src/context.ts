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

export function createObservabilityContext(
  incoming: ObservabilityContextInput = {}
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
  overrides: ObservabilityContextInput = {}
): ObservabilityContext {
  return {
    requestId: base.requestId,
    correlationId: base.correlationId,
    traceId: sanitizeObservabilityId(overrides.traceId) ?? base.traceId,
    subject: overrides.subject ?? base.subject,
    tenant: overrides.tenant ?? base.tenant,
    branch: overrides.branch ?? base.branch,
    service: overrides.service ?? base.service,
    environment: overrides.environment ?? base.environment
  };
}
