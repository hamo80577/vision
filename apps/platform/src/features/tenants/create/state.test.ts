import { describe, expect, it } from "vitest";

import {
  createDefaultCreateTenantFormValues,
  type CreateTenantFormValues,
} from "./form-values";
import {
  initialCreateTenantActionState,
  lookupCreateTenantFieldError,
  normalizeCreateTenantActionState,
  normalizeCreateTenantFieldErrors,
} from "./state";

describe("create tenant action state", () => {
  it("exports a safe initial action state", () => {
    expect(initialCreateTenantActionState).toEqual({
      status: "idle",
      fieldErrors: {},
      submitError: null,
      result: null,
      values: createDefaultCreateTenantFormValues(),
    });
  });

  it("returns an empty field-error map when fieldErrors is missing", () => {
    expect(normalizeCreateTenantFieldErrors(undefined)).toEqual({});
    expect(normalizeCreateTenantFieldErrors(null)).toEqual({});
  });

  it("looks up nested field errors safely from malformed state", () => {
    expect(lookupCreateTenantFieldError(undefined, "tenant.displayName")).toBeUndefined();
    expect(
      lookupCreateTenantFieldError({ "tenant.displayName": "Required" }, "tenant.displayName"),
    ).toBe("Required");
  });

  it("normalizes a partial action state without crashing", () => {
    const expectedDefaults = createDefaultCreateTenantFormValues();

    expect(
      normalizeCreateTenantActionState({
        status: "validation_error",
        submitError: "Review the highlighted fields and try again.",
      }),
    ).toEqual({
      status: "validation_error",
      fieldErrors: {},
      submitError: "Review the highlighted fields and try again.",
      result: null,
      values: expectedDefaults,
    });
  });

  it("normalizes partial submitted values without crashing", () => {
    const normalized = normalizeCreateTenantActionState({
      values: {
        tenantDisplayName: "North Coast Spa",
        tenantSlug: "North Coast Spa",
      } satisfies Partial<CreateTenantFormValues>,
    });

    expect(normalized.values.tenantDisplayName).toBe("North Coast Spa");
    expect(normalized.values.tenantSlug).toBe("North Coast Spa");
    expect(normalized.values.ownerFullName).toBe("");
    expect((normalized.values as unknown as Record<string, unknown>).fieldErrors).toBeUndefined();
  });

  it("ignores malformed field error entries", () => {
    expect(
      normalizeCreateTenantFieldErrors({
        "tenant.displayName": "Required",
        "tenant.slug": 42,
      }),
    ).toEqual({
      "tenant.displayName": "Required",
    });
  });
});
