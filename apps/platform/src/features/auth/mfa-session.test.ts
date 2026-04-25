import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readPlatformMfaSession } from "./mfa-session";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => {
          storage.delete(key);
        },
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("readPlatformMfaSession", () => {
  it("drops incomplete enrollment data so the QR setup can be fetched again", () => {
    window.sessionStorage.setItem(
      "vision.platform.mfa-session",
      JSON.stringify({
        challengeToken: "challenge.token",
        enrollment: {
          manualEntryKey: "ABCDEF",
        },
        loginIdentifier: "platform.review@vision.test",
        nextStep: "mfa_enrollment_required",
      }),
    );

    expect(readPlatformMfaSession()).toMatchObject({
      challengeToken: "challenge.token",
      enrollment: null,
      loginIdentifier: "platform.review@vision.test",
      nextStep: "mfa_enrollment_required",
    });
  });
});
