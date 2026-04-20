const OBSERVABILITY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const OBSERVABILITY_ID_MAX_LENGTH = 128;

export function isSafeObservabilityId(value: string): boolean {
  return OBSERVABILITY_ID_PATTERN.test(value);
}

export function sanitizeObservabilityId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (value.length === 0 || value.length > OBSERVABILITY_ID_MAX_LENGTH) {
    return undefined;
  }

  return isSafeObservabilityId(value) ? value : undefined;
}

export function createObservabilityId(): string {
  const candidate = `obs-${globalThis.crypto.randomUUID()}`;
  const safeCandidate = sanitizeObservabilityId(candidate);

  if (safeCandidate) {
    return safeCandidate;
  }

  return `obs-${Math.random().toString(36).slice(2, 18)}`;
}
