import { describe, expect, it } from "vitest";

import {
  deriveAdminTargetDatabaseUrl,
  parseDatabaseRoleCredentials,
} from "./role-hardening";

describe("role hardening helpers", () => {
  it("derives the admin target URL from the maintenance URL", () => {
    expect(
      deriveAdminTargetDatabaseUrl(
        "postgresql://vision_admin:vision_admin_password@localhost:5433/postgres",
        "vision_local",
      ),
    ).toBe(
      "postgresql://vision_admin:vision_admin_password@localhost:5433/vision_local",
    );
  });

  it("parses the runtime role from DATABASE_URL", () => {
    expect(
      parseDatabaseRoleCredentials(
        "postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local",
      ),
    ).toEqual({
      roleName: "vision_runtime",
      rolePassword: "vision_runtime_password",
    });
  });

  it("fails when DATABASE_URL omits runtime role credentials", () => {
    expect(() =>
      parseDatabaseRoleCredentials("postgresql://localhost:5433/vision_local"),
    ).toThrow("DATABASE_URL must include a runtime role username and password");
  });
});
