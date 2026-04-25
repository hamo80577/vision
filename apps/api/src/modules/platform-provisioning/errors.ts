const PLATFORM_PROVISIONING_ERROR_NAME = "PlatformProvisioningError";

export type PlatformProvisioningErrorCode = "tenant_not_found" | "tenant_conflict";

const PLATFORM_PROVISIONING_ERROR_MESSAGES: Record<PlatformProvisioningErrorCode, string> = {
  tenant_not_found: "Tenant not found.",
  tenant_conflict: "Tenant provisioning conflict.",
};

export class PlatformProvisioningError extends Error {
  readonly code: PlatformProvisioningErrorCode;

  constructor(code: PlatformProvisioningErrorCode, message?: string) {
    super(message ?? PLATFORM_PROVISIONING_ERROR_MESSAGES[code]);
    this.name = PLATFORM_PROVISIONING_ERROR_NAME;
    this.code = code;
  }
}

export function isPlatformProvisioningError(value: unknown): value is PlatformProvisioningError {
  return value instanceof PlatformProvisioningError;
}
