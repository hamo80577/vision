import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PlatformShell } from "./platform-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tenants",
}));

const auth = {
  subject: {
    id: "subject_platform_admin",
    subjectType: "internal",
    loginIdentifier: "platform.review@vision.test",
    internalSensitivity: "platform_admin",
  },
  session: {
    sessionId: "session_platform_admin",
    subjectId: "subject_platform_admin",
    subjectType: "internal",
    assuranceLevel: "mfa_verified",
    assuranceUpdatedAt: "2026-04-25T10:00:00.000Z",
    activeTenantId: null,
    activeBranchId: null,
    expiresAt: "2026-04-25T12:00:00.000Z",
  },
} as const;

function hasNestedButton(html: string): boolean {
  const buttonTokens = html.match(/<\/?button\b[^>]*>/gi) ?? [];
  let openButtonDepth = 0;

  for (const token of buttonTokens) {
    if (token.startsWith("</")) {
      openButtonDepth = Math.max(0, openButtonDepth - 1);
      continue;
    }

    if (openButtonDepth > 0) {
      return true;
    }

    openButtonDepth += 1;
  }

  return false;
}

describe("PlatformShell", () => {
  it("keeps sidebar toggle and logout as separate non-nested buttons", () => {
    const html = renderToStaticMarkup(
      createElement(PlatformShell, {
        auth,
        children: createElement("main", null, "Tenant directory"),
      }),
    );

    expect(hasNestedButton(html)).toBe(false);
    expect(html).toContain('aria-label="Close sidebar"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('type="button"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Logout");
  });
});
