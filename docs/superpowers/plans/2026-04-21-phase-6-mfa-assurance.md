# Phase 6 MFA and Assurance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend Phase 6 MFA and assurance slice for sensitive internal roles: pending MFA login challenges, TOTP enrollment and verification, hashed backup codes, reusable step-up challenges, ordered assurance levels, and server-side assurance enforcement.

**Architecture:** Keep database structure in `packages/db` and `db/migrations`, reusable auth primitives and orchestration in `packages/authn`, the HTTP contract in `apps/api`, and the new runtime encryption secret in `@vision/config`. Use a temporary `internal_sensitivity` marker only for MFA policy in this phase, and keep authorization decisions out of scope.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL, Zod, Node `crypto`, `otpauth`, Vitest

---

## File Structure

### Create

- `packages/authn/src/assurance.ts`
- `packages/authn/src/assurance.test.ts`
- `packages/authn/src/mfa.ts`
- `packages/authn/src/mfa.test.ts`
- `db/migrations/0002_phase_6_mfa_assurance.sql`
- `docs/security/mfa-and-assurance.md`

### Modify

- `.env.example`
- `packages/config/src/index.ts`
- `packages/config/src/index.test.ts`
- `packages/observability/src/errors.ts`
- `packages/observability/src/problem-details.ts`
- `packages/authn/package.json`
- `packages/authn/src/index.ts`
- `packages/authn/src/errors.ts`
- `packages/authn/src/service.ts`
- `packages/authn/src/service.integration.test.ts`
- `packages/db/src/schema/auth.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/index.ts`
- `db/migrations/meta/_journal.json`
- `db/migrations/meta/0002_snapshot.json`
- `apps/api/src/runtime.ts`
- `apps/api/src/auth-plugin.ts`
- `apps/api/src/auth-routes.test.ts`
- `apps/api/src/server.ts`
- `docs/security/README.md`
- `docs/security/logging-and-error-safety.md`
- `pnpm-lock.yaml`

### Responsibilities

- `packages/config/src/index.ts`: require and validate the API-side MFA encryption key and key version.
- `packages/observability/src/problem-details.ts`: add a stable `insufficient_assurance` client error code.
- `packages/observability/src/errors.ts`: carry safe `requiredAssurance` and `denialReason` fields into problem responses.
- `packages/authn/src/assurance.ts`: ordered assurance levels, denial reasons, and freshness-aware assurance comparison.
- `packages/authn/src/mfa.ts`: challenge-token helpers, TOTP secret encryption/decryption, TOTP provisioning/verification, and backup-code generation/verification.
- `packages/authn/src/service.ts`: sensitive-login branching, challenge lifecycle, MFA enrollment/verification, step-up, backup-code regeneration, audit writes, and the assurance guard.
- `packages/db/src/schema/auth.ts`: temporary internal sensitivity marker, expanded assurance enums, MFA factor tables, backup-code table, and assurance-challenge table.
- `apps/api/src/auth-plugin.ts`: `202` pending-MFA login contract, MFA/step-up endpoints, `401` vs `403 insufficient_assurance` split, and cookie issuance only after verification.
- `apps/api/src/server.ts`: keep error logging safe by serializing exceptions instead of logging raw objects.
- `docs/security/mfa-and-assurance.md`: living documentation for the Phase 6 auth assumptions and the temporary sensitivity bridge.

## Task 1: Add MFA Runtime Config and Shared Auth Primitives

**Files:**
- Create: `packages/authn/src/assurance.test.ts`
- Create: `packages/authn/src/assurance.ts`
- Create: `packages/authn/src/mfa.test.ts`
- Create: `packages/authn/src/mfa.ts`
- Modify: `.env.example`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/src/index.test.ts`
- Modify: `packages/observability/src/errors.ts`
- Modify: `packages/observability/src/problem-details.ts`
- Modify: `packages/authn/package.json`
- Modify: `packages/authn/src/index.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing config and helper tests**

Create `packages/authn/src/assurance.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  compareAssuranceLevels,
  resolveAssuranceFailure,
} from "./assurance";

describe("assurance helpers", () => {
  it("orders assurance levels from basic to step-up verified", () => {
    expect(compareAssuranceLevels("basic", "mfa_verified")).toBeLessThan(0);
    expect(compareAssuranceLevels("mfa_verified", "step_up_verified")).toBeLessThan(0);
    expect(compareAssuranceLevels("step_up_verified", "basic")).toBeGreaterThan(0);
    expect(compareAssuranceLevels("mfa_verified", "mfa_verified")).toBe(0);
  });

  it("returns step_up_stale when freshness is exceeded", () => {
    expect(
      resolveAssuranceFailure({
        currentAssurance: "step_up_verified",
        requiredAssurance: "step_up_verified",
        assuranceUpdatedAt: new Date("2026-04-21T10:00:00.000Z"),
        now: new Date("2026-04-21T10:06:00.000Z"),
        maxAgeMs: 5 * 60 * 1000,
      }),
    ).toBe("step_up_stale");
  });

  it("returns step_up_required when the session assurance is too low", () => {
    expect(
      resolveAssuranceFailure({
        currentAssurance: "mfa_verified",
        requiredAssurance: "step_up_verified",
        assuranceUpdatedAt: new Date("2026-04-21T10:00:00.000Z"),
        now: new Date("2026-04-21T10:00:00.000Z"),
      }),
    ).toBe("step_up_required");
  });
});
```

Create `packages/authn/src/mfa.test.ts`:

```ts
import OTPAuth from "otpauth";
import { describe, expect, it } from "vitest";

import {
  createChallengeToken,
  createTotpProvisioning,
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  parseChallengeToken,
  verifyBackupCodeHash,
  verifyChallengeSecret,
  verifyTotpCode,
} from "./mfa";

const MFA_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

describe("mfa helpers", () => {
  it("creates challenge tokens whose secrets verify against the stored hash", () => {
    const created = createChallengeToken();
    const parsed = parseChallengeToken(created.token);

    expect(parsed).toEqual({
      challengeId: created.challengeId,
      secret: created.secret,
    });
    expect(verifyChallengeSecret(created.secretHash, created.secret)).toBe(true);
    expect(verifyChallengeSecret(created.secretHash, "wrong-secret")).toBe(false);
  });

  it("encrypts and decrypts a TOTP secret without storing plaintext", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptTotpSecret(secret, MFA_ENCRYPTION_KEY);

    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, MFA_ENCRYPTION_KEY)).toBe(secret);
  });

  it("generates hashed backup codes that only verify the original value", () => {
    const [first] = generateBackupCodes(1);

    expect(first.plainText).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    expect(first.hash).not.toBe(first.plainText);
    expect(verifyBackupCodeHash(first.hash, first.plainText)).toBe(true);
    expect(verifyBackupCodeHash(first.hash, "WRONG-CODE1")).toBe(false);
  });

  it("builds a TOTP provisioning payload that can verify a live code", () => {
    const manualEntryKey = generateTotpSecret();
    const provisioning = createTotpProvisioning({
      issuer: "Vision",
      accountName: "ops@vision.test",
      manualEntryKey,
    });
    const now = new Date("2026-04-21T12:00:00.000Z");
    const totp = new OTPAuth.TOTP({
      issuer: "Vision",
      label: "ops@vision.test",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(manualEntryKey),
    });
    const code = totp.generate({ timestamp: now.getTime() });

    expect(provisioning.otpauthUrl.startsWith("otpauth://totp/")).toBe(true);
    expect(verifyTotpCode(manualEntryKey, code, now)).toBe(true);
  });
});
```

Append these cases to `packages/config/src/index.test.ts`:

```ts
const validApiEnv = {
  APP_ENV: "local",
  API_HOST: "127.0.0.1",
  API_PORT: "4000",
  DATABASE_URL: localDatabaseUrl,
  AUTH_MFA_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  AUTH_MFA_ENCRYPTION_KEY_VERSION: "v1",
};

it("parses valid local API MFA config", () => {
  expect(parseApiConfig(validApiEnv)).toEqual({
    appEnv: "local",
    host: "127.0.0.1",
    port: 4000,
    databaseUrl: localDatabaseUrl,
    logLevel: "info",
    mfaEncryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    mfaEncryptionKeyVersion: "v1",
  });
});

it("fails when AUTH_MFA_ENCRYPTION_KEY is missing for API config", () => {
  const {
    AUTH_MFA_ENCRYPTION_KEY: _missingEncryptionKey,
    ...missingEncryptionKeyEnv
  } = validApiEnv;

  expect(() => parseApiConfig(missingEncryptionKeyEnv)).toThrow(ConfigError);
});

it("fails when AUTH_MFA_ENCRYPTION_KEY is not a base64-encoded 32-byte key", () => {
  expect(() =>
    parseApiConfig({
      ...validApiEnv,
      AUTH_MFA_ENCRYPTION_KEY: "not-a-valid-key",
    }),
  ).toThrow(ConfigError);
});
```

- [ ] **Step 2: Run the failing helper tests**

Run:

```powershell
pnpm --filter @vision/config test -- src/index.test.ts
pnpm --filter @vision/authn test -- src/assurance.test.ts src/mfa.test.ts
```

Expected: FAIL because the MFA config fields, `assurance.ts`, and `mfa.ts` do not exist yet.

- [ ] **Step 3: Add the runtime config and primitive implementations**

Update `.env.example`:

```dotenv
# API and worker runtime
API_HOST=0.0.0.0
API_PORT=4000
AUTH_MFA_ENCRYPTION_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=
AUTH_MFA_ENCRYPTION_KEY_VERSION=v1
```

Update `packages/config/src/index.ts`:

```ts
const mfaEncryptionKeySchema = z.string().refine(
  (value) => {
    try {
      return Buffer.from(value, "base64").length === 32;
    } catch {
      return false;
    }
  },
  {
    message: "must be a base64-encoded 32-byte key",
  },
);

const apiEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  API_HOST: z.string().min(1),
  API_PORT: portSchema,
  DATABASE_URL: databaseUrlSchema,
  AUTH_MFA_ENCRYPTION_KEY: mfaEncryptionKeySchema,
  AUTH_MFA_ENCRYPTION_KEY_VERSION: z.string().min(1),
  LOG_LEVEL: logLevelSchema.default("info"),
});

export type ApiConfig = {
  appEnv: AppEnvironment;
  host: string;
  port: number;
  databaseUrl: string;
  mfaEncryptionKey: string;
  mfaEncryptionKeyVersion: string;
  logLevel: LogLevel;
};

export function parseApiConfig(env: RuntimeEnv): ApiConfig {
  const parsed = parseEnv(apiEnvSchema, env);

  assertSafeDatabaseUrl(parsed.APP_ENV, parsed.DATABASE_URL);

  return {
    appEnv: parsed.APP_ENV,
    host: parsed.API_HOST,
    port: parsed.API_PORT,
    databaseUrl: parsed.DATABASE_URL,
    mfaEncryptionKey: parsed.AUTH_MFA_ENCRYPTION_KEY,
    mfaEncryptionKeyVersion: parsed.AUTH_MFA_ENCRYPTION_KEY_VERSION,
    logLevel: parsed.LOG_LEVEL,
  };
}
```

Update `packages/observability/src/problem-details.ts`:

```ts
export type ProblemCode =
  | "internal_error"
  | "validation_error"
  | "unauthenticated"
  | "forbidden"
  | "insufficient_assurance"
  | "not_found"
  | "conflict";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail: string;
  instance: string;
  requiredAssurance?: string;
  denialReason?: string;
  traceId?: string;
  errors?: ProblemValidationIssue[];
}

export function createProblemDetails(input: ProblemDetailsInput): ProblemDetails {
  const next: ProblemDetails = {
    type: input.type,
    title: input.title,
    status: input.status,
    code: input.code,
    detail: input.detail,
    instance: sanitizeProblemInstance(input.instance),
  };

  if (typeof input.requiredAssurance === "string") {
    next.requiredAssurance = input.requiredAssurance;
  }

  if (typeof input.denialReason === "string") {
    next.denialReason = input.denialReason;
  }

  const traceId = sanitizeObservabilityId(input.traceId);
  if (traceId !== undefined) {
    next.traceId = traceId;
  }

  if (input.code === "validation_error" && input.errors !== undefined) {
    next.errors = input.errors;
  }

  return next;
}
```

Update `packages/observability/src/errors.ts`:

```ts
export type ProblemErrorOptions = ProblemDefinition & {
  detail: string;
  instance?: string;
  traceId?: string;
  requiredAssurance?: string;
  denialReason?: string;
  errors?: ProblemDetails["errors"];
};

export class ProblemError extends Error {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: ProblemCode;
  readonly requiredAssurance?: string;
  readonly denialReason?: string;
  readonly errors?: ProblemDetails["errors"];
  readonly problem: ProblemDetails;

  constructor(options: ProblemErrorOptions) {
    super(options.detail);
    this.name = PROBLEM_ERROR_NAME;
    this.type = options.type;
    this.title = options.title;
    this.status = options.status;
    this.code = options.code;
    this.requiredAssurance = options.requiredAssurance;
    this.denialReason = options.denialReason;
    this.errors = options.code === "validation_error" ? options.errors : undefined;
    this.problem = createProblemDetails({
      type: options.type,
      title: options.title,
      status: options.status,
      code: options.code,
      detail: options.detail,
      instance: options.instance,
      requiredAssurance: options.requiredAssurance,
      denialReason: options.denialReason,
      traceId: options.traceId,
      errors: this.errors,
    });
  }
}
```

Update `packages/authn/package.json`:

```json
{
  "name": "@vision/authn",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --out-dir dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@vision/db": "workspace:*",
    "argon2": "^0.44.0",
    "drizzle-orm": "^0.45.2",
    "otpauth": "^9.4.1"
  }
}
```

Create `packages/authn/src/assurance.ts`:

```ts
export type AuthAssuranceLevel = "basic" | "mfa_verified" | "step_up_verified";

export type AssuranceDenialReason =
  | "mfa_required"
  | "step_up_required"
  | "step_up_stale";

const AUTH_ASSURANCE_RANK: Record<AuthAssuranceLevel, number> = {
  basic: 0,
  mfa_verified: 1,
  step_up_verified: 2,
};

export function compareAssuranceLevels(
  left: AuthAssuranceLevel,
  right: AuthAssuranceLevel,
): number {
  return AUTH_ASSURANCE_RANK[left] - AUTH_ASSURANCE_RANK[right];
}

export function resolveAssuranceFailure(input: {
  currentAssurance: AuthAssuranceLevel;
  requiredAssurance: AuthAssuranceLevel;
  assuranceUpdatedAt: Date;
  now: Date;
  maxAgeMs?: number;
}): AssuranceDenialReason | null {
  if (compareAssuranceLevels(input.currentAssurance, input.requiredAssurance) < 0) {
    return input.requiredAssurance === "mfa_verified"
      ? "mfa_required"
      : "step_up_required";
  }

  if (
    input.maxAgeMs !== undefined &&
    input.assuranceUpdatedAt.getTime() + input.maxAgeMs < input.now.getTime()
  ) {
    return "step_up_stale";
  }

  return null;
}
```

Create `packages/authn/src/mfa.ts`:

```ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import OTPAuth from "otpauth";

const AES_ALGORITHM = "aes-256-gcm";
const AES_IV_BYTES = 12;
const CHALLENGE_SECRET_BYTES = 32;

export type ParsedChallengeToken = {
  challengeId: string;
  secret: string;
};

export type CreatedChallengeToken = ParsedChallengeToken & {
  token: string;
  secretHash: string;
};

export type GeneratedBackupCode = {
  plainText: string;
  hash: string;
};

function decodeEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");

  if (key.length !== 32) {
    throw new Error("Invalid MFA encryption key.");
  }

  return key;
}

function normalizeBackupCode(code: string): string {
  return code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export function hashOpaqueSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifyChallengeSecret(expectedHash: string, secret: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashOpaqueSecret(secret), "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createChallengeToken(): CreatedChallengeToken {
  const challengeId = `chl_${randomUUID()}`;
  const secret = randomBytes(CHALLENGE_SECRET_BYTES).toString("base64url");

  return {
    challengeId,
    secret,
    token: `${challengeId}.${secret}`,
    secretHash: hashOpaqueSecret(secret),
  };
}

export function parseChallengeToken(token: string): ParsedChallengeToken {
  const [challengeId, secret, ...rest] = token.split(".");

  if (!challengeId || !secret || rest.length > 0) {
    throw new Error("Invalid assurance challenge token.");
  }

  return {
    challengeId,
    secret,
  };
}

export function encryptTotpSecret(secret: string, encryptionKey: string): string {
  const iv = randomBytes(AES_IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, decodeEncryptionKey(encryptionKey), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptTotpSecret(payload: string, encryptionKey: string): string {
  const [iv, ciphertext, tag] = payload.split(".");

  if (!iv || !ciphertext || !tag) {
    throw new Error("Invalid encrypted TOTP payload.");
  }

  const decipher = createDecipheriv(
    AES_ALGORITHM,
    decodeEncryptionKey(encryptionKey),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function createTotpProvisioning(input: {
  issuer: string;
  accountName: string;
  manualEntryKey: string;
}) {
  const totp = new OTPAuth.TOTP({
    issuer: input.issuer,
    label: input.accountName,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(input.manualEntryKey),
  });

  return {
    manualEntryKey: input.manualEntryKey,
    otpauthUrl: totp.toString(),
  };
}

export function verifyTotpCode(
  manualEntryKey: string,
  code: string,
  now: Date,
): boolean {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(manualEntryKey),
  });

  return totp.validate({ token: code, timestamp: now.getTime(), window: 1 }) !== null;
}

export function generateBackupCodes(count = 8): GeneratedBackupCode[] {
  return Array.from({ length: count }, () => {
    const normalized = randomBytes(5).toString("hex").toUpperCase();
    const plainText = `${normalized.slice(0, 5)}-${normalized.slice(5)}`;

    return {
      plainText,
      hash: hashOpaqueSecret(normalizeBackupCode(plainText)),
    };
  });
}

export function verifyBackupCodeHash(expectedHash: string, code: string): boolean {
  return verifyChallengeSecret(expectedHash, normalizeBackupCode(code));
}
```

Update `packages/authn/src/index.ts`:

```ts
export const authnPackageName = "@vision/authn" as const;
export { AuthnError, isAuthnError, type AuthnErrorCode } from "./errors";
export {
  compareAssuranceLevels,
  resolveAssuranceFailure,
  type AssuranceDenialReason,
  type AuthAssuranceLevel,
} from "./assurance";
export { hashPassword, verifyPassword } from "./password";
export {
  createChallengeToken,
  createTotpProvisioning,
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  parseChallengeToken,
  verifyBackupCodeHash,
  verifyChallengeSecret,
  verifyTotpCode,
} from "./mfa";
export {
  createAuthnService,
  normalizeLoginIdentifier,
  type AuthResolution,
  type AuthSessionSummary,
  type AuthSubjectSummary,
  type AuthSubjectType,
  type AuthnService,
} from "./service";
export {
  createSessionToken,
  hashSessionSecret,
  parseSessionToken,
  verifySessionSecret,
} from "./session-token";
```

Update `apps/api/src/runtime.ts`:

```ts
export type ApiRuntimeConfig = {
  appEnv: AppEnvironment;
  host: string;
  port: number;
  databaseUrl: string;
  mfaEncryptionKey: string;
  mfaEncryptionKeyVersion: string;
  logLevel: LogLevel;
  serviceName: "vision-api";
};

export function getApiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  const config = parseApiConfig(env);

  return {
    appEnv: config.appEnv,
    host: config.host,
    port: config.port,
    databaseUrl: config.databaseUrl,
    mfaEncryptionKey: config.mfaEncryptionKey,
    mfaEncryptionKeyVersion: config.mfaEncryptionKeyVersion,
    logLevel: config.logLevel,
    serviceName: "vision-api",
  };
}
```

Install and refresh the lockfile:

```powershell
pnpm install
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run:

```powershell
pnpm --filter @vision/config test -- src/index.test.ts
pnpm --filter @vision/authn test -- src/assurance.test.ts src/mfa.test.ts
```

Expected: PASS with `0 failed`.

- [ ] **Step 5: Commit**

```powershell
git add .env.example packages/config/src/index.ts packages/config/src/index.test.ts packages/observability/src/problem-details.ts packages/observability/src/errors.ts packages/authn/package.json packages/authn/src/index.ts packages/authn/src/assurance.ts packages/authn/src/assurance.test.ts packages/authn/src/mfa.ts packages/authn/src/mfa.test.ts apps/api/src/runtime.ts pnpm-lock.yaml
git commit -m "feat: add mfa config and assurance primitives"
```

## Task 2: Add the Phase 6 Auth Schema and Authn Service Flows

**Files:**
- Modify: `packages/authn/src/errors.ts`
- Modify: `packages/authn/src/service.ts`
- Modify: `packages/authn/src/service.integration.test.ts`
- Modify: `packages/db/src/schema/auth.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`
- Create: `db/migrations/0002_phase_6_mfa_assurance.sql`
- Modify: `db/migrations/meta/_journal.json`
- Modify: `db/migrations/meta/0002_snapshot.json`

- [ ] **Step 1: Write the failing auth-service integration tests**

Add `import OTPAuth from "otpauth";` near the top of `packages/authn/src/service.integration.test.ts`. Replace the existing `authn` setup and `seedSubject` helper with this version, then append the new tests below:

```ts
const MFA_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

const authn = createAuthnService(db, {
  sessionTtlMs: 60 * 60 * 1000,
  mfaEncryptionKey: MFA_ENCRYPTION_KEY,
  mfaEncryptionKeyVersion: "v1",
  totpIssuer: "Vision",
});

async function seedSubject(
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
  internalSensitivity: "none" | "platform_admin" | "tenant_owner" | "branch_manager" | null = null,
) {
  const id = `sub_${randomUUID()}`;
  createdSubjectIds.push(id);

  await db.insert(authSubjects).values({
    id,
    subjectType,
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword(password),
    internalSensitivity,
  });

  return { id };
}

it(
  "returns a pending challenge for a sensitive internal login without creating a session",
  async () => {
    const loginIdentifier = `admin+${randomUUID()}@vision.test`;
    await seedSubject("internal", loginIdentifier, "S3cure-password!", "platform_admin");

    const result = await authn.login({
      subjectType: "internal",
      loginIdentifier,
      password: "S3cure-password!",
    });

    expect(result).toMatchObject({
      kind: "mfa_challenge",
      nextStep: "mfa_enrollment_required",
      requiredAssurance: "mfa_verified",
    });
    await expect(db.select().from(authSessions)).resolves.toHaveLength(0);
  },
  AUTHN_INTEGRATION_TIMEOUT_MS,
);

it(
  "verifies TOTP enrollment and issues the first mfa_verified session with backup codes",
  async () => {
    const loginIdentifier = `owner+${randomUUID()}@vision.test`;
    await seedSubject("internal", loginIdentifier, "S3cure-password!", "tenant_owner");

    const login = await authn.login({
      subjectType: "internal",
      loginIdentifier,
      password: "S3cure-password!",
    });

    if (login.kind !== "mfa_challenge") {
      throw new Error("Expected MFA challenge result.");
    }

    const enrollment = await authn.startMfaEnrollment({
      challengeToken: login.challengeToken,
      accountName: loginIdentifier,
    });
    const now = new Date();
    const totp = new OTPAuth.TOTP({
      issuer: "Vision",
      label: loginIdentifier,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(enrollment.manualEntryKey),
    });
    const code = totp.generate({ timestamp: now.getTime() });
    const completed = await authn.verifyMfaEnrollment({
      challengeToken: login.challengeToken,
      code,
      now,
    });
    createdSessionIds.push(completed.session.sessionId);

    expect(completed.session.assuranceLevel).toBe("mfa_verified");
    expect(completed.backupCodes).toHaveLength(8);
    expect(completed.backupCodes[0]).not.toContain("-");
  },
  AUTHN_INTEGRATION_TIMEOUT_MS,
);

it(
  "uses a backup code only once across repeated sensitive logins",
  async () => {
    const loginIdentifier = `manager+${randomUUID()}@vision.test`;
    await seedSubject("internal", loginIdentifier, "S3cure-password!", "branch_manager");

    const firstLogin = await authn.login({
      subjectType: "internal",
      loginIdentifier,
      password: "S3cure-password!",
    });

    if (firstLogin.kind !== "mfa_challenge") {
      throw new Error("Expected MFA challenge result.");
    }

    const enrollment = await authn.startMfaEnrollment({
      challengeToken: firstLogin.challengeToken,
      accountName: loginIdentifier,
    });
    const now = new Date();
    const totp = new OTPAuth.TOTP({
      issuer: "Vision",
      label: loginIdentifier,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(enrollment.manualEntryKey),
    });
    const enrollmentCode = totp.generate({ timestamp: now.getTime() });
    const completedEnrollment = await authn.verifyMfaEnrollment({
      challengeToken: firstLogin.challengeToken,
      code: enrollmentCode,
      now,
    });
    createdSessionIds.push(completedEnrollment.session.sessionId);

    const backupCode = completedEnrollment.backupCodes[0];
    const secondLogin = await authn.login({
      subjectType: "internal",
      loginIdentifier,
      password: "S3cure-password!",
    });

    if (secondLogin.kind !== "mfa_challenge") {
      throw new Error("Expected MFA challenge result.");
    }

    const firstVerification = await authn.verifyMfaChallenge({
      challengeToken: secondLogin.challengeToken,
      backupCode,
      now,
    });
    createdSessionIds.push(firstVerification.session.sessionId);
    expect(firstVerification.session.assuranceLevel).toBe("mfa_verified");

    const thirdLogin = await authn.login({
      subjectType: "internal",
      loginIdentifier,
      password: "S3cure-password!",
    });

    if (thirdLogin.kind !== "mfa_challenge") {
      throw new Error("Expected MFA challenge result.");
    }

    await expect(
      authn.verifyMfaChallenge({
        challengeToken: thirdLogin.challengeToken,
        backupCode,
        now,
      }),
    ).rejects.toMatchObject({
      code: "invalid_backup_code",
    });
  },
  AUTHN_INTEGRATION_TIMEOUT_MS,
);

it(
  "upgrades an authenticated session to step_up_verified and rejects stale assurance",
  async () => {
    const loginIdentifier = `support+${randomUUID()}@vision.test`;
    await seedSubject("internal", loginIdentifier, "S3cure-password!", "platform_admin");

    const login = await authn.login({
      subjectType: "internal",
      loginIdentifier,
      password: "S3cure-password!",
    });

    if (login.kind !== "mfa_challenge") {
      throw new Error("Expected MFA challenge result.");
    }

    const enrollment = await authn.startMfaEnrollment({
      challengeToken: login.challengeToken,
      accountName: loginIdentifier,
    });
    const verificationTime = new Date("2026-04-21T12:00:00.000Z");
    const totp = new OTPAuth.TOTP({
      issuer: "Vision",
      label: loginIdentifier,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(enrollment.manualEntryKey),
    });
    const enrollmentCode = totp.generate({ timestamp: verificationTime.getTime() });
    const completedEnrollment = await authn.verifyMfaEnrollment({
      challengeToken: login.challengeToken,
      code: enrollmentCode,
      now: verificationTime,
    });
    createdSessionIds.push(completedEnrollment.session.sessionId);

    const stepUp = await authn.startStepUpChallenge({
      token: completedEnrollment.sessionToken,
      reason: "support_grant_activation",
    });
    const stepUpCode = totp.generate({ timestamp: verificationTime.getTime() });
    const steppedUp = await authn.verifyStepUpChallenge({
      token: completedEnrollment.sessionToken,
      challengeToken: stepUp.challengeToken,
      totpCode: stepUpCode,
      now: verificationTime,
    });

    expect(steppedUp.session.assuranceLevel).toBe("step_up_verified");

    await expect(
      authn.requireAssurance({
        token: steppedUp.sessionToken,
        requiredAssurance: "step_up_verified",
        reason: "support_grant_activation",
        now: new Date("2026-04-21T12:20:00.000Z"),
        maxAgeMs: 5 * 60 * 1000,
      }),
    ).rejects.toMatchObject({
      code: "insufficient_assurance",
      context: {
        denialReason: "step_up_stale",
      },
    });
  },
  AUTHN_INTEGRATION_TIMEOUT_MS,
);
```

- [ ] **Step 2: Run the auth-service integration test to verify it fails**

Run:

```powershell
$env:APP_ENV='test'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
pnpm --filter @vision/authn test -- src/service.integration.test.ts
```

Expected: FAIL because the schema, new error codes, and MFA service methods do not exist yet.

- [ ] **Step 3: Implement the schema, migrations, and auth service**

Replace `packages/db/src/schema/auth.ts` with:

```ts
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  sql,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const authSubjectType = pgEnum("auth_subject_type", [
  "customer",
  "internal",
]);

export const authInternalSensitivity = pgEnum("auth_internal_sensitivity", [
  "none",
  "platform_admin",
  "tenant_owner",
  "branch_manager",
]);

export const authAssuranceLevel = pgEnum("auth_assurance_level", [
  "basic",
  "mfa_verified",
  "step_up_verified",
]);

export const authAssuranceChallengeReason = pgEnum("auth_assurance_challenge_reason", [
  "login_mfa",
  "mfa_enrollment",
  "tenant_context_switch",
  "support_grant_activation",
  "website_management_write",
  "data_export",
  "credential_reset",
]);

export const authAccountEventType = pgEnum("auth_account_event_type", [
  "login_success",
  "login_failure",
  "logout",
  "session_revoked",
  "session_rotated",
  "mfa_enrollment_started",
  "mfa_enrollment_completed",
  "mfa_challenge_created",
  "mfa_challenge_failed",
  "mfa_verified",
  "backup_code_used",
  "backup_codes_regenerated",
  "step_up_started",
  "step_up_verified",
  "assurance_denied",
]);

export const authSubjects = pgTable(
  "auth_subjects",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectType: authSubjectType("subject_type").notNull(),
    loginIdentifier: varchar("login_identifier", { length: 255 }).notNull(),
    normalizedLoginIdentifier: varchar("normalized_login_identifier", {
      length: 255,
    }).notNull(),
    passwordHash: text("password_hash").notNull(),
    internalSensitivity: authInternalSensitivity("internal_sensitivity"),
    passwordUpdatedAt: timestamp("password_updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bySubjectTypeAndLogin: uniqueIndex("auth_subjects_subject_type_login_key").on(
      table.subjectType,
      table.normalizedLoginIdentifier,
    ),
    normalizedLoginIdx: index("auth_subjects_normalized_login_idx").on(
      table.normalizedLoginIdentifier,
    ),
  }),
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 })
      .notNull()
      .references(() => authSubjects.id, { onDelete: "cascade" }),
    subjectType: authSubjectType("subject_type").notNull(),
    secretHash: text("secret_hash").notNull(),
    assuranceLevel: authAssuranceLevel("assurance_level").notNull().default("basic"),
    assuranceUpdatedAt: timestamp("assurance_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    activeTenantId: varchar("active_tenant_id", { length: 64 }),
    activeBranchId: varchar("active_branch_id", { length: 64 }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: varchar("revocation_reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: index("auth_sessions_subject_idx").on(table.subjectId),
    activeIdx: index("auth_sessions_active_idx").on(table.expiresAt, table.revokedAt),
  }),
);

export const authAssuranceChallenges = pgTable(
  "auth_assurance_challenges",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 })
      .notNull()
      .references(() => authSubjects.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 64 }).references(() => authSessions.id, {
      onDelete: "cascade",
    }),
    requiredAssurance: authAssuranceLevel("required_assurance").notNull(),
    reason: authAssuranceChallengeReason("reason").notNull(),
    secretHash: text("secret_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: index("auth_assurance_challenges_subject_idx").on(table.subjectId),
    sessionIdx: index("auth_assurance_challenges_session_idx").on(table.sessionId),
    activeIdx: index("auth_assurance_challenges_active_idx").on(table.expiresAt),
  }),
);

export const authMfaTotpFactors = pgTable(
  "auth_mfa_totp_factors",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 })
      .notNull()
      .references(() => authSubjects.id, { onDelete: "cascade" }),
    encryptedSecret: text("encrypted_secret").notNull(),
    encryptionKeyVersion: varchar("encryption_key_version", { length: 32 }).notNull(),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: index("auth_mfa_totp_factors_subject_idx").on(table.subjectId),
    activePerSubjectIdx: uniqueIndex("auth_mfa_totp_factors_active_subject_key")
      .on(table.subjectId)
      .where(sql`${table.disabledAt} is null`),
  }),
);

export const authMfaBackupCodes = pgTable(
  "auth_mfa_backup_codes",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 })
      .notNull()
      .references(() => authSubjects.id, { onDelete: "cascade" }),
    batchId: varchar("batch_id", { length: 64 }).notNull(),
    codeHash: text("code_hash").notNull(),
    ordinal: integer("ordinal").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => ({
    subjectIdx: index("auth_mfa_backup_codes_subject_idx").on(table.subjectId),
    batchIdx: index("auth_mfa_backup_codes_batch_idx").on(table.batchId),
  }),
);

export const authAccountEvents = pgTable(
  "auth_account_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectId: varchar("subject_id", { length: 64 }).references(() => authSubjects.id, {
      onDelete: "set null",
    }),
    sessionId: varchar("session_id", { length: 64 }).references(() => authSessions.id, {
      onDelete: "set null",
    }),
    subjectType: authSubjectType("subject_type").notNull(),
    eventType: authAccountEventType("event_type").notNull(),
    loginIdentifier: varchar("login_identifier", { length: 255 }),
    detail: text("detail"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectEventIdx: index("auth_account_events_subject_idx").on(table.subjectId),
    sessionEventIdx: index("auth_account_events_session_idx").on(table.sessionId),
  }),
);
```

Update `packages/db/src/schema/index.ts`:

```ts
export { appMetadata } from "./app-metadata";
export {
  authAccountEvents,
  authAccountEventType,
  authAssuranceChallenges,
  authAssuranceChallengeReason,
  authAssuranceLevel,
  authInternalSensitivity,
  authMfaBackupCodes,
  authMfaTotpFactors,
  authSessions,
  authSubjects,
  authSubjectType,
} from "./auth";
```

Update `packages/db/src/index.ts`:

```ts
export {
  closeDatabasePool,
  createDatabaseClient,
  createDatabasePool,
  createRuntimeDatabase,
  type DatabasePool,
  type VisionDatabase,
} from "./client";
export {
  getDatabaseAdminConfig,
  getDatabaseRuntimeConfig,
  type DatabaseAdminConfig,
  type DatabaseRuntimeConfig,
} from "./config";
export { checkDatabaseHealth } from "./health";
export {
  appMetadata,
  authAccountEvents,
  authAssuranceChallenges,
  authMfaBackupCodes,
  authMfaTotpFactors,
  authSessions,
  authSubjects,
} from "./schema";
export { withDatabaseTransaction } from "./transactions";
```

Update `packages/authn/src/errors.ts`:

```ts
import type { AssuranceDenialReason, AuthAssuranceLevel } from "./assurance";

export type AuthnErrorCode =
  | "invalid_credentials"
  | "invalid_session_token"
  | "missing_session"
  | "expired_session"
  | "revoked_session"
  | "disabled_subject"
  | "invalid_assurance_challenge"
  | "expired_assurance_challenge"
  | "consumed_assurance_challenge"
  | "invalid_totp_code"
  | "invalid_backup_code"
  | "insufficient_assurance";

export type AuthnErrorContext = {
  requiredAssurance?: AuthAssuranceLevel;
  denialReason?: AssuranceDenialReason;
};

const AUTHN_ERROR_MESSAGES: Record<AuthnErrorCode, string> = {
  invalid_credentials: "Invalid login credentials.",
  invalid_session_token: "Invalid session token.",
  missing_session: "Authentication required.",
  expired_session: "Session has expired.",
  revoked_session: "Session has been revoked.",
  disabled_subject: "Account is disabled.",
  invalid_assurance_challenge: "Invalid assurance challenge.",
  expired_assurance_challenge: "Assurance challenge has expired.",
  consumed_assurance_challenge: "Assurance challenge has already been consumed.",
  invalid_totp_code: "Invalid TOTP code.",
  invalid_backup_code: "Invalid backup code.",
  insufficient_assurance: "Higher assurance is required.",
};

export class AuthnError extends Error {
  readonly code: AuthnErrorCode;
  readonly context: AuthnErrorContext;

  constructor(
    code: AuthnErrorCode,
    detail = AUTHN_ERROR_MESSAGES[code],
    context: AuthnErrorContext = {},
  ) {
    super(detail);
    this.name = "AuthnError";
    this.code = code;
    this.context = context;
  }
}

export function isAuthnError(value: unknown): value is AuthnError {
  return value instanceof AuthnError;
}
```

Update `packages/authn/src/service.ts` by replacing the type block and service return object with:

```ts
import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  authAccountEvents,
  authAssuranceChallenges,
  authMfaBackupCodes,
  authMfaTotpFactors,
  authSessions,
  authSubjects,
  type VisionDatabase,
} from "@vision/db";

import {
  resolveAssuranceFailure,
  type AssuranceDenialReason,
  type AuthAssuranceLevel,
} from "./assurance";
import { AuthnError } from "./errors";
import {
  createChallengeToken,
  createTotpProvisioning,
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  parseChallengeToken,
  verifyBackupCodeHash,
  verifyChallengeSecret,
  verifyTotpCode,
} from "./mfa";
import { verifyPassword } from "./password";
import {
  createSessionToken,
  parseSessionToken,
  verifySessionSecret,
} from "./session-token";

export type AuthSubjectType = "customer" | "internal";
export type AuthInternalSensitivity =
  | "none"
  | "platform_admin"
  | "tenant_owner"
  | "branch_manager";
export type AuthAssuranceChallengeReason =
  | "login_mfa"
  | "mfa_enrollment"
  | "tenant_context_switch"
  | "support_grant_activation"
  | "website_management_write"
  | "data_export"
  | "credential_reset";

export type AuthSubjectSummary = {
  id: string;
  subjectType: AuthSubjectType;
  loginIdentifier: string;
  internalSensitivity: AuthInternalSensitivity | null;
};

export type AuthSessionSummary = {
  sessionId: string;
  subjectId: string;
  subjectType: AuthSubjectType;
  assuranceLevel: AuthAssuranceLevel;
  assuranceUpdatedAt: Date;
  activeTenantId: string | null;
  activeBranchId: string | null;
  expiresAt: Date;
};

export type AuthResolution = {
  subject: AuthSubjectSummary;
  session: AuthSessionSummary;
};

export type AuthPendingChallengeResult = {
  kind: "mfa_challenge";
  challengeId: string;
  challengeToken: string;
  requiredAssurance: "mfa_verified";
  nextStep: "mfa_enrollment_required" | "mfa_verification_required";
  reason: "login_mfa" | "mfa_enrollment";
  expiresAt: Date;
};

export type AuthSessionResult = AuthResolution & {
  kind: "session";
  sessionToken: string;
};

export type AuthEnrollmentResult = AuthSessionResult & {
  backupCodes: string[];
};

export type AuthnServiceOptions = {
  now?: () => Date;
  sessionTtlMs?: number;
  mfaEncryptionKey: string;
  mfaEncryptionKeyVersion: string;
  totpIssuer?: string;
};

function normalizeLoginIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function createAuthnService(
  db: VisionDatabase,
  options: AuthnServiceOptions,
) {
  const now = options.now ?? (() => new Date());
  const sessionTtlMs = options.sessionTtlMs ?? 1000 * 60 * 60 * 12;
  const totpIssuer = options.totpIssuer ?? "Vision";

  async function writeEvent(input: {
    subjectType: AuthSubjectType;
    eventType:
      | "login_success"
      | "login_failure"
      | "logout"
      | "session_revoked"
      | "session_rotated"
      | "mfa_enrollment_started"
      | "mfa_enrollment_completed"
      | "mfa_challenge_created"
      | "mfa_challenge_failed"
      | "mfa_verified"
      | "backup_code_used"
      | "backup_codes_regenerated"
      | "step_up_started"
      | "step_up_verified"
      | "assurance_denied";
    subjectId?: string | null;
    sessionId?: string | null;
    loginIdentifier?: string | null;
    detail?: string | null;
  }) {
    await db.insert(authAccountEvents).values({
      id: `evt_${randomUUID()}`,
      subjectId: input.subjectId ?? null,
      sessionId: input.sessionId ?? null,
      subjectType: input.subjectType,
      eventType: input.eventType,
      loginIdentifier: input.loginIdentifier ?? null,
      detail: input.detail ?? null,
      occurredAt: now(),
    });
  }

  async function loadSubjectById(subjectId: string): Promise<AuthSubjectSummary> {
    const [subject] = await db
      .select()
      .from(authSubjects)
      .where(and(eq(authSubjects.id, subjectId), eq(authSubjects.isEnabled, true)))
      .limit(1);

    if (!subject) {
      throw new AuthnError("missing_session");
    }

    return {
      id: subject.id,
      subjectType: subject.subjectType,
      loginIdentifier: subject.loginIdentifier,
      internalSensitivity: subject.internalSensitivity ?? null,
    };
  }

  async function loadResolution(sessionId: string): Promise<AuthResolution> {
    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new AuthnError("missing_session");
    }

    return {
      subject: await loadSubjectById(session.subjectId),
      session: {
        sessionId: session.id,
        subjectId: session.subjectId,
        subjectType: session.subjectType,
        assuranceLevel: session.assuranceLevel,
        assuranceUpdatedAt: session.assuranceUpdatedAt,
        activeTenantId: session.activeTenantId ?? null,
        activeBranchId: session.activeBranchId ?? null,
        expiresAt: session.expiresAt,
      },
    };
  }

  async function getStoredSession(token: string) {
    let parsedToken: ReturnType<typeof parseSessionToken>;

    try {
      parsedToken = parseSessionToken(token);
    } catch {
      throw new AuthnError("invalid_session_token");
    }

    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, parsedToken.sessionId))
      .limit(1);

    if (!session) {
      throw new AuthnError("missing_session");
    }

    if (!verifySessionSecret(session.secretHash, parsedToken.secret)) {
      throw new AuthnError("invalid_session_token");
    }

    if (session.revokedAt) {
      throw new AuthnError("revoked_session");
    }

    if (session.expiresAt.getTime() <= now().getTime()) {
      throw new AuthnError("expired_session");
    }

    return session;
  }

  async function createSession(input: {
    subjectId: string;
    subjectType: AuthSubjectType;
    assuranceLevel: AuthAssuranceLevel;
  }): Promise<AuthSessionResult> {
    const created = createSessionToken();
    const issuedAt = now();
    const expiresAt = new Date(issuedAt.getTime() + sessionTtlMs);

    await db.insert(authSessions).values({
      id: created.sessionId,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
      secretHash: created.secretHash,
      assuranceLevel: input.assuranceLevel,
      assuranceUpdatedAt: issuedAt,
      issuedAt,
      expiresAt,
      lastRotatedAt: issuedAt,
    });

    return {
      kind: "session",
      ...(await loadResolution(created.sessionId)),
      sessionToken: created.token,
    };
  }

  async function createChallenge(input: {
    subjectId: string;
    subjectType: AuthSubjectType;
    sessionId?: string;
    requiredAssurance: "mfa_verified" | "step_up_verified";
    reason: AuthAssuranceChallengeReason;
  }) {
    const created = createChallengeToken();
    const expiresAt = new Date(now().getTime() + 10 * 60 * 1000);

    await db.insert(authAssuranceChallenges).values({
      id: created.challengeId,
      subjectId: input.subjectId,
      sessionId: input.sessionId ?? null,
      requiredAssurance: input.requiredAssurance,
      reason: input.reason,
      secretHash: created.secretHash,
      expiresAt,
    });

    await writeEvent({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      sessionId: input.sessionId ?? null,
      eventType: "mfa_challenge_created",
      detail: input.reason,
    });

    return {
      challengeId: created.challengeId,
      challengeToken: created.token,
      expiresAt,
    };
  }

  async function requireActiveChallenge(challengeToken: string) {
    let parsed;

    try {
      parsed = parseChallengeToken(challengeToken);
    } catch {
      throw new AuthnError("invalid_assurance_challenge");
    }

    const [challenge] = await db
      .select()
      .from(authAssuranceChallenges)
      .where(eq(authAssuranceChallenges.id, parsed.challengeId))
      .limit(1);

    if (!challenge || !verifyChallengeSecret(challenge.secretHash, parsed.secret)) {
      throw new AuthnError("invalid_assurance_challenge");
    }

    if (challenge.invalidatedAt || challenge.consumedAt) {
      throw new AuthnError("consumed_assurance_challenge");
    }

    if (challenge.expiresAt.getTime() <= now().getTime()) {
      throw new AuthnError("expired_assurance_challenge");
    }

    return challenge;
  }

  async function consumeChallenge(challengeId: string) {
    await db
      .update(authAssuranceChallenges)
      .set({
        consumedAt: now(),
        completedAt: now(),
        updatedAt: now(),
      })
      .where(eq(authAssuranceChallenges.id, challengeId));
  }

  async function verifyChallengeMaterial(input: {
    challenge: Awaited<ReturnType<typeof requireActiveChallenge>>;
    totpCode?: string;
    backupCode?: string;
    verificationTime: Date;
  }) {
    const [factor] = await db
      .select()
      .from(authMfaTotpFactors)
      .where(
        and(
          eq(authMfaTotpFactors.subjectId, input.challenge.subjectId),
          isNull(authMfaTotpFactors.disabledAt),
        ),
      )
      .limit(1);

    let verified = false;

    if (factor && input.totpCode) {
      const decrypted = decryptTotpSecret(factor.encryptedSecret, options.mfaEncryptionKey);
      verified = verifyTotpCode(decrypted, input.totpCode, input.verificationTime);
    }

    if (!verified && input.backupCode) {
      const codes = await db
        .select()
        .from(authMfaBackupCodes)
        .where(
          and(
            eq(authMfaBackupCodes.subjectId, input.challenge.subjectId),
            isNull(authMfaBackupCodes.usedAt),
          ),
        );
      const matched = codes.find((code) =>
        verifyBackupCodeHash(code.codeHash, input.backupCode as string),
      );

      if (matched) {
        await db
          .update(authMfaBackupCodes)
          .set({
            usedAt: input.verificationTime,
          })
          .where(eq(authMfaBackupCodes.id, matched.id));
        await writeEvent({
          subjectType: "internal",
          subjectId: input.challenge.subjectId,
          eventType: "backup_code_used",
        });
        verified = true;
      }
    }

    if (!verified) {
      await writeEvent({
        subjectType: "internal",
        subjectId: input.challenge.subjectId,
        eventType: "mfa_challenge_failed",
        detail: input.backupCode ? "invalid_backup_code" : "invalid_totp_code",
      });
      throw new AuthnError(input.backupCode ? "invalid_backup_code" : "invalid_totp_code");
    }
  }

  return {
    async login(input: {
      subjectType: AuthSubjectType;
      loginIdentifier: string;
      password: string;
    }): Promise<AuthPendingChallengeResult | AuthSessionResult> {
      const normalizedLoginIdentifier = normalizeLoginIdentifier(input.loginIdentifier);
      const [subject] = await db
        .select()
        .from(authSubjects)
        .where(
          and(
            eq(authSubjects.subjectType, input.subjectType),
            eq(authSubjects.normalizedLoginIdentifier, normalizedLoginIdentifier),
          ),
        )
        .limit(1);

      if (!subject || !(await verifyPassword(subject.passwordHash, input.password))) {
        await writeEvent({
          subjectType: input.subjectType,
          eventType: "login_failure",
          subjectId: subject?.id ?? null,
          loginIdentifier: input.loginIdentifier,
          detail: "invalid_credentials",
        });
        throw new AuthnError("invalid_credentials");
      }

      if (!subject.isEnabled) {
        throw new AuthnError("disabled_subject");
      }

      const sensitivity = subject.internalSensitivity ?? null;

      if (subject.subjectType === "internal" && sensitivity && sensitivity !== "none") {
        const [factor] = await db
          .select()
          .from(authMfaTotpFactors)
          .where(
            and(
              eq(authMfaTotpFactors.subjectId, subject.id),
              isNull(authMfaTotpFactors.disabledAt),
            ),
          )
          .limit(1);
        const reason = factor?.verifiedAt ? "login_mfa" : "mfa_enrollment";
        const challenge = await createChallenge({
          subjectId: subject.id,
          subjectType: subject.subjectType,
          requiredAssurance: "mfa_verified",
          reason,
        });

        return {
          kind: "mfa_challenge",
          challengeId: challenge.challengeId,
          challengeToken: challenge.challengeToken,
          requiredAssurance: "mfa_verified",
          nextStep: factor?.verifiedAt
            ? "mfa_verification_required"
            : "mfa_enrollment_required",
          reason,
          expiresAt: challenge.expiresAt,
        };
      }

      const session = await createSession({
        subjectId: subject.id,
        subjectType: subject.subjectType,
        assuranceLevel: "basic",
      });

      await writeEvent({
        subjectType: subject.subjectType,
        subjectId: subject.id,
        sessionId: session.session.sessionId,
        eventType: "login_success",
        loginIdentifier: subject.loginIdentifier,
      });

      return session;
    },

    async resolveSession(input: { token: string }) {
      const session = await getStoredSession(input.token);

      return loadResolution(session.id);
    },

    async startMfaEnrollment(input: { challengeToken: string; accountName: string }) {
      const challenge = await requireActiveChallenge(input.challengeToken);
      const manualEntryKey = generateTotpSecret();
      const encryptedSecret = encryptTotpSecret(manualEntryKey, options.mfaEncryptionKey);

      await db
        .insert(authMfaTotpFactors)
        .values({
          id: `totp_${randomUUID()}`,
          subjectId: challenge.subjectId,
          encryptedSecret,
          encryptionKeyVersion: options.mfaEncryptionKeyVersion,
        });

      return createTotpProvisioning({
        issuer: totpIssuer,
        accountName: input.accountName,
        manualEntryKey,
      });
    },

    async verifyMfaEnrollment(input: {
      challengeToken: string;
      code: string;
      now?: Date;
    }): Promise<AuthEnrollmentResult> {
      const challenge = await requireActiveChallenge(input.challengeToken);
      const [factor] = await db
        .select()
        .from(authMfaTotpFactors)
        .where(
          and(
            eq(authMfaTotpFactors.subjectId, challenge.subjectId),
            isNull(authMfaTotpFactors.disabledAt),
          ),
        )
        .limit(1);

      if (!factor) {
        throw new AuthnError("invalid_totp_code");
      }

      const decrypted = decryptTotpSecret(factor.encryptedSecret, options.mfaEncryptionKey);
      const verificationTime = input.now ?? now();

      if (!verifyTotpCode(decrypted, input.code, verificationTime)) {
        await writeEvent({
          subjectType: "internal",
          subjectId: challenge.subjectId,
          eventType: "mfa_challenge_failed",
          detail: "invalid_totp_code",
        });
        throw new AuthnError("invalid_totp_code");
      }

      await db
        .update(authMfaTotpFactors)
        .set({
          verifiedAt: verificationTime,
          lastUsedAt: verificationTime,
          updatedAt: verificationTime,
        })
        .where(eq(authMfaTotpFactors.id, factor.id));

      const batchId = `bkp_${randomUUID()}`;
      const backupCodes = generateBackupCodes();
      await db.insert(authMfaBackupCodes).values(
        backupCodes.map((code, index) => ({
          id: `bkc_${randomUUID()}`,
          subjectId: challenge.subjectId,
          batchId,
          codeHash: code.hash,
          ordinal: index,
        })),
      );

      await consumeChallenge(challenge.id);

      const session = await createSession({
        subjectId: challenge.subjectId,
        subjectType: "internal",
        assuranceLevel: "mfa_verified",
      });

      await writeEvent({
        subjectType: "internal",
        subjectId: challenge.subjectId,
        sessionId: session.session.sessionId,
        eventType: "mfa_enrollment_completed",
      });

      return {
        ...session,
        backupCodes: backupCodes.map((code) => code.plainText.replace("-", "")),
      };
    },

    async verifyMfaChallenge(input: {
      challengeToken: string;
      totpCode?: string;
      backupCode?: string;
      now?: Date;
    }): Promise<AuthSessionResult> {
      const challenge = await requireActiveChallenge(input.challengeToken);
      await verifyChallengeMaterial({
        challenge,
        totpCode: input.totpCode,
        backupCode: input.backupCode,
        verificationTime: input.now ?? now(),
      });

      await consumeChallenge(challenge.id);

      const session = await createSession({
        subjectId: challenge.subjectId,
        subjectType: "internal",
        assuranceLevel: "mfa_verified",
      });

      await writeEvent({
        subjectType: "internal",
        subjectId: challenge.subjectId,
        sessionId: session.session.sessionId,
        eventType: "mfa_verified",
      });

      return session;
    },

    async startStepUpChallenge(input: {
      token: string;
      reason: Exclude<AuthAssuranceChallengeReason, "login_mfa" | "mfa_enrollment">;
    }) {
      const resolution = await this.requireAssurance({
        token: input.token,
        requiredAssurance: "mfa_verified",
        reason: input.reason,
      });
      const challenge = await createChallenge({
        subjectId: resolution.subject.id,
        subjectType: resolution.subject.subjectType,
        sessionId: resolution.session.sessionId,
        requiredAssurance: "step_up_verified",
        reason: input.reason,
      });

      await writeEvent({
        subjectType: resolution.subject.subjectType,
        subjectId: resolution.subject.id,
        sessionId: resolution.session.sessionId,
        eventType: "step_up_started",
        detail: input.reason,
      });

      return challenge;
    },

    async verifyStepUpChallenge(input: {
      token: string;
      challengeToken: string;
      totpCode?: string;
      backupCode?: string;
      now?: Date;
    }): Promise<AuthSessionResult> {
      const resolution = await this.resolveSession({ token: input.token });
      const challenge = await requireActiveChallenge(input.challengeToken);

      if (challenge.sessionId !== resolution.session.sessionId) {
        throw new AuthnError("invalid_assurance_challenge");
      }

      await verifyChallengeMaterial({
        challenge,
        totpCode: input.totpCode,
        backupCode: input.backupCode,
        verificationTime: input.now ?? now(),
      });
      await consumeChallenge(challenge.id);

      await db
        .update(authSessions)
        .set({
          assuranceLevel: "step_up_verified",
          assuranceUpdatedAt: input.now ?? now(),
          updatedAt: input.now ?? now(),
        })
        .where(eq(authSessions.id, resolution.session.sessionId));

      await writeEvent({
        subjectType: resolution.subject.subjectType,
        subjectId: resolution.subject.id,
        sessionId: resolution.session.sessionId,
        eventType: "step_up_verified",
        detail: challenge.reason,
      });

      return {
        kind: "session",
        ...(await loadResolution(resolution.session.sessionId)),
        sessionToken: input.token,
      };
    },

    async regenerateBackupCodes(input: { token: string }) {
      const resolution = await this.requireAssurance({
        token: input.token,
        requiredAssurance: "step_up_verified",
        reason: "credential_reset",
      });
      const unusedCodes = await db
        .select()
        .from(authMfaBackupCodes)
        .where(
          and(
            eq(authMfaBackupCodes.subjectId, resolution.subject.id),
            isNull(authMfaBackupCodes.usedAt),
          ),
        );

      if (unusedCodes.length > 0) {
        await db
          .update(authMfaBackupCodes)
          .set({ usedAt: now() })
          .where(inArray(authMfaBackupCodes.id, unusedCodes.map((code) => code.id)));
      }

      const batchId = `bkp_${randomUUID()}`;
      const backupCodes = generateBackupCodes();
      await db.insert(authMfaBackupCodes).values(
        backupCodes.map((code, index) => ({
          id: `bkc_${randomUUID()}`,
          subjectId: resolution.subject.id,
          batchId,
          codeHash: code.hash,
          ordinal: index,
        })),
      );

      await writeEvent({
        subjectType: resolution.subject.subjectType,
        subjectId: resolution.subject.id,
        sessionId: resolution.session.sessionId,
        eventType: "backup_codes_regenerated",
      });

      return backupCodes.map((code) => code.plainText.replace("-", ""));
    },

    async requireAssurance(input: {
      token: string;
      requiredAssurance: AuthAssuranceLevel;
      reason: string;
      now?: Date;
      maxAgeMs?: number;
    }) {
      const resolution = await this.resolveSession({ token: input.token });
      const denial = resolveAssuranceFailure({
        currentAssurance: resolution.session.assuranceLevel,
        requiredAssurance: input.requiredAssurance,
        assuranceUpdatedAt: resolution.session.assuranceUpdatedAt,
        now: input.now ?? now(),
        maxAgeMs: input.maxAgeMs,
      });

      if (denial) {
        await writeEvent({
          subjectType: resolution.subject.subjectType,
          subjectId: resolution.subject.id,
          sessionId: resolution.session.sessionId,
          eventType: "assurance_denied",
          detail: input.reason,
        });
        throw new AuthnError("insufficient_assurance", undefined, {
          requiredAssurance: input.requiredAssurance,
          denialReason: denial,
        });
      }

      return resolution;
    },
  };
}

export type AuthnService = ReturnType<typeof createAuthnService>;
export { normalizeLoginIdentifier };
```

Generate the migration artifacts:

```powershell
$env:APP_ENV='local'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
pnpm db:generate
```

Expected: a new `db/migrations/0002_phase_6_mfa_assurance.sql`, an updated `db/migrations/meta/_journal.json`, and `db/migrations/meta/0002_snapshot.json`.

- [ ] **Step 4: Run the auth-service integration test to verify it passes**

Run:

```powershell
$env:APP_ENV='test'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
pnpm --filter @vision/authn test -- src/service.integration.test.ts
```

Expected: PASS with the new MFA and step-up cases green.

- [ ] **Step 5: Commit**

```powershell
git add packages/db/src/schema/auth.ts packages/db/src/schema/index.ts packages/db/src/index.ts db/migrations packages/authn/src/errors.ts packages/authn/src/service.ts packages/authn/src/service.integration.test.ts
git commit -m "feat: add phase 6 auth schema and service flows"
```

## Task 3: Wire the API MFA and Assurance Contract

**Files:**
- Modify: `apps/api/src/auth-plugin.ts`
- Modify: `apps/api/src/auth-routes.test.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Write the failing API route tests**

Add `import OTPAuth from "otpauth";` near the top of `apps/api/src/auth-routes.test.ts`. Replace the existing `runtime`, `authn`, and `seedSubject` test fixtures with the updated versions below:

```ts
async function seedSubject(
  subjectType: "customer" | "internal",
  loginIdentifier: string,
  password: string,
  internalSensitivity: "none" | "platform_admin" | "tenant_owner" | "branch_manager" | null = null,
) {
  const id = `sub_${randomUUID()}`;
  createdSubjectIds.push(id);

  await db.insert(authSubjects).values({
    id,
    subjectType,
    loginIdentifier,
    normalizedLoginIdentifier: normalizeLoginIdentifier(loginIdentifier),
    passwordHash: await hashPassword(password),
    internalSensitivity,
  });
}
```

Then append these tests to `apps/api/src/auth-routes.test.ts`:

```ts
const MFA_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

const runtime = {
  appEnv,
  host: "127.0.0.1",
  port: 4000,
  databaseUrl,
  mfaEncryptionKey: MFA_ENCRYPTION_KEY,
  mfaEncryptionKeyVersion: "v1",
  logLevel: "debug",
  serviceName: "vision-api",
} as const;

const authn = createAuthnService(db, {
  sessionTtlMs: 60 * 60 * 1000,
  mfaEncryptionKey: MFA_ENCRYPTION_KEY,
  mfaEncryptionKeyVersion: "v1",
  totpIssuer: "Vision",
});

it(
  "returns a pending challenge for a sensitive internal login without setting a cookie",
  async () => {
    const api = buildApi({ runtime, authService: authn });
    const loginIdentifier = `admin+${randomUUID()}@vision.test`;
    await seedSubject("internal", loginIdentifier, "S3cure-password!", "platform_admin");

    const response = await api.inject({
      method: "POST",
      url: "/auth/internal/login",
      payload: {
        loginIdentifier,
        password: "S3cure-password!",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.json()).toMatchObject({
      nextStep: "mfa_enrollment_required",
      requiredAssurance: "mfa_verified",
    });

    await api.close();
  },
  AUTH_ROUTE_TEST_TIMEOUT_MS,
);

it(
  "completes MFA enrollment and sets a real auth cookie only after verification",
  async () => {
    const api = buildApi({ runtime, authService: authn });
    const loginIdentifier = `owner+${randomUUID()}@vision.test`;
    await seedSubject("internal", loginIdentifier, "S3cure-password!", "tenant_owner");

    const login = await api.inject({
      method: "POST",
      url: "/auth/internal/login",
      payload: {
        loginIdentifier,
        password: "S3cure-password!",
      },
    });
    const challengeToken = (login.json() as { challengeToken: string }).challengeToken;

    const start = await api.inject({
      method: "POST",
      url: "/auth/internal/mfa/enrollment/start",
      payload: {
        challengeToken,
        accountName: loginIdentifier,
      },
    });
    const enrollment = start.json() as { manualEntryKey: string };
    const now = new Date("2026-04-21T12:00:00.000Z");
    const totp = new OTPAuth.TOTP({
      issuer: "Vision",
      label: loginIdentifier,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(enrollment.manualEntryKey),
    });
    const code = totp.generate({ timestamp: now.getTime() });

    const verify = await api.inject({
      method: "POST",
      url: "/auth/internal/mfa/enrollment/verify",
      payload: {
        challengeToken,
        code,
      },
    });

    expect(verify.statusCode).toBe(200);
    expect(verify.headers["set-cookie"]).toContain("HttpOnly");
    expect(verify.json()).toMatchObject({
      session: {
        assuranceLevel: "mfa_verified",
      },
    });

    await api.close();
  },
  AUTH_ROUTE_TEST_TIMEOUT_MS,
);

it(
  "returns 403 insufficient_assurance when backup-code regeneration is called without step-up",
  async () => {
    const api = buildApi({ runtime, authService: authn });
    const loginIdentifier = `manager+${randomUUID()}@vision.test`;
    await seedSubject("internal", loginIdentifier, "S3cure-password!", "branch_manager");

    const login = await api.inject({
      method: "POST",
      url: "/auth/internal/login",
      payload: {
        loginIdentifier,
        password: "S3cure-password!",
      },
    });
    const challengeToken = (login.json() as { challengeToken: string }).challengeToken;
    const start = await api.inject({
      method: "POST",
      url: "/auth/internal/mfa/enrollment/start",
      payload: {
        challengeToken,
        accountName: loginIdentifier,
      },
    });
    const enrollment = start.json() as { manualEntryKey: string };
    const now = new Date("2026-04-21T12:00:00.000Z");
    const totp = new OTPAuth.TOTP({
      issuer: "Vision",
      label: loginIdentifier,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(enrollment.manualEntryKey),
    });
    const code = totp.generate({ timestamp: now.getTime() });
    const verify = await api.inject({
      method: "POST",
      url: "/auth/internal/mfa/enrollment/verify",
      payload: {
        challengeToken,
        code,
      },
    });
    const cookie = getAuthCookie(verify.headers["set-cookie"]);

    const response = await api.inject({
      method: "POST",
      url: "/auth/internal/mfa/backup-codes/regenerate",
      headers: {
        cookie,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "insufficient_assurance",
      requiredAssurance: "step_up_verified",
      denialReason: "step_up_required",
    });

    await api.close();
  },
  AUTH_ROUTE_TEST_TIMEOUT_MS,
);
```

- [ ] **Step 2: Run the auth-routes test to verify it fails**

Run:

```powershell
$env:APP_ENV='test'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
$env:AUTH_MFA_ENCRYPTION_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
$env:AUTH_MFA_ENCRYPTION_KEY_VERSION='v1'
pnpm --filter @vision/api test -- src/auth-routes.test.ts
```

Expected: FAIL because the new routes, `202` login behavior, and `403 insufficient_assurance` response do not exist yet.

- [ ] **Step 3: Implement the API contract**

Replace `apps/api/src/auth-plugin.ts` with:

```ts
import fastifyCookie from "@fastify/cookie";
import type { FastifyPluginAsync } from "fastify";

import {
  AuthnError,
  createAuthnService,
  isAuthnError,
  type AuthResolution,
  type AuthnService,
} from "@vision/authn";
import { closeDatabasePool, createRuntimeDatabase } from "@vision/db";
import { ProblemError, getProblemDefinitionForStatus } from "@vision/observability";

import type { ApiRuntimeConfig } from "./runtime";
import { clearAuthCookie, readAuthCookie, setAuthCookie } from "./auth-cookie";

type AuthPluginOptions = {
  runtime: ApiRuntimeConfig;
  authService?: AuthnService;
};

type RequestWithAuth = {
  auth: AuthResolution | null;
  authFailure: AuthnError["code"] | null;
};

function unauthenticated(detail: string): ProblemError {
  return new ProblemError({
    ...getProblemDefinitionForStatus(401),
    detail,
  });
}

function insufficientAssurance(error: AuthnError): ProblemError {
  return new ProblemError({
    status: 403,
    code: "insufficient_assurance",
    title: "Insufficient Assurance",
    type: "https://vision.local/problems/insufficient-assurance",
    detail: error.message,
    requiredAssurance: error.context.requiredAssurance,
    denialReason: error.context.denialReason,
  });
}

function getAuthFailureDetail(code: AuthnError["code"] | null): string {
  switch (code) {
    case "invalid_credentials":
      return "Invalid login credentials.";
    case "expired_session":
      return "Session has expired.";
    case "revoked_session":
      return "Session has been revoked.";
    default:
      return "Authentication required.";
  }
}

function requireAuth(request: RequestWithAuth): AuthResolution {
  if (request.auth) {
    return request.auth;
  }

  throw unauthenticated(getAuthFailureDetail(request.authFailure));
}

function mapAuthnError(error: AuthnError): never {
  if (error.code === "insufficient_assurance") {
    throw insufficientAssurance(error);
  }

  if (
    error.code === "invalid_assurance_challenge" ||
    error.code === "expired_assurance_challenge" ||
    error.code === "consumed_assurance_challenge" ||
    error.code === "invalid_totp_code" ||
    error.code === "invalid_backup_code"
  ) {
    throw new ProblemError({
      type: "https://vision.local/problems/validation-error",
      title: "Validation Error",
      status: 422,
      code: "validation_error",
      detail: error.message,
    });
  }

  throw unauthenticated(getAuthFailureDetail(error.code));
}

function getRuntimeDatabase(options: AuthPluginOptions) {
  if (options.authService) {
    return null;
  }

  return createRuntimeDatabase({
    appEnv: options.runtime.appEnv,
    databaseUrl: options.runtime.databaseUrl,
  });
}

export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (api, options) => {
  await api.register(fastifyCookie);

  const runtimeDatabase = getRuntimeDatabase(options);
  const authService =
    options.authService ??
    createAuthnService(
      (() => {
        if (!runtimeDatabase) {
          throw new Error("Expected runtime database when authService is not provided.");
        }

        return runtimeDatabase.db;
      })(),
      {
        mfaEncryptionKey: options.runtime.mfaEncryptionKey,
        mfaEncryptionKeyVersion: options.runtime.mfaEncryptionKeyVersion,
      },
    );

  if (runtimeDatabase) {
    api.addHook("onClose", async () => {
      await closeDatabasePool(runtimeDatabase.pool);
    });
  }

  api.decorateRequest("auth", null);
  api.decorateRequest("authFailure", null);

  api.addHook("onRequest", async (request) => {
    const token = readAuthCookie(request);
    request.auth = null;
    request.authFailure = null;

    if (!token) {
      return;
    }

    try {
      request.auth = await authService.resolveSession({ token });
    } catch (error) {
      if (isAuthnError(error)) {
        request.authFailure = error.code;
        return;
      }

      throw error;
    }
  });

  const loginSchema = {
    body: {
      type: "object",
      required: ["loginIdentifier", "password"],
      additionalProperties: false,
      properties: {
        loginIdentifier: { type: "string", minLength: 1 },
        password: { type: "string", minLength: 1 },
      },
    },
  } as const;

  api.post("/auth/customer/login", { schema: loginSchema }, async (request, reply) => {
    try {
      const body = request.body as { loginIdentifier: string; password: string };
      const result = await authService.login({
        subjectType: "customer",
        loginIdentifier: body.loginIdentifier,
        password: body.password,
      });

      if (result.kind !== "session") {
        throw new Error("Customer login must not require MFA.");
      }

      setAuthCookie(reply, options.runtime.appEnv, result.sessionToken, result.session.expiresAt);

      return {
        subject: result.subject,
        session: result.session,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/login", { schema: loginSchema }, async (request, reply) => {
    try {
      const body = request.body as { loginIdentifier: string; password: string };
      const result = await authService.login({
        subjectType: "internal",
        loginIdentifier: body.loginIdentifier,
        password: body.password,
      });

      if (result.kind === "mfa_challenge") {
        reply.code(202);
        return result;
      }

      setAuthCookie(reply, options.runtime.appEnv, result.sessionToken, result.session.expiresAt);
      return {
        subject: result.subject,
        session: result.session,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/enrollment/start", async (request) => {
    try {
      const body = request.body as { challengeToken: string; accountName: string };
      return authService.startMfaEnrollment(body);
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/enrollment/verify", async (request, reply) => {
    try {
      const body = request.body as { challengeToken: string; code: string };
      const result = await authService.verifyMfaEnrollment(body);

      setAuthCookie(reply, options.runtime.appEnv, result.sessionToken, result.session.expiresAt);
      return {
        subject: result.subject,
        session: result.session,
        backupCodes: result.backupCodes,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/verify", async (request, reply) => {
    try {
      const body = request.body as {
        challengeToken: string;
        code?: string;
        backupCode?: string;
      };
      const result = await authService.verifyMfaChallenge({
        challengeToken: body.challengeToken,
        totpCode: body.code,
        backupCode: body.backupCode,
      });

      setAuthCookie(reply, options.runtime.appEnv, result.sessionToken, result.session.expiresAt);
      return {
        subject: result.subject,
        session: result.session,
      };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/assurance/step-up/start", async (request) => {
    const token = readAuthCookie(request);

    if (!token) {
      throw unauthenticated("Authentication required.");
    }

    try {
      const body = request.body as { reason: string };
      return await authService.startStepUpChallenge({
        token,
        reason: body.reason as
          | "tenant_context_switch"
          | "support_grant_activation"
          | "website_management_write"
          | "data_export"
          | "credential_reset",
      });
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/assurance/step-up/verify", async (request) => {
    const token = readAuthCookie(request);

    if (!token) {
      throw unauthenticated("Authentication required.");
    }

    try {
      const body = request.body as {
        challengeToken: string;
        code?: string;
        backupCode?: string;
      };
      return await authService.verifyStepUpChallenge({
        token,
        challengeToken: body.challengeToken,
        totpCode: body.code,
        backupCode: body.backupCode,
      });
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.post("/auth/internal/mfa/backup-codes/regenerate", async (request) => {
    const token = readAuthCookie(request);

    if (!token) {
      throw unauthenticated("Authentication required.");
    }

    try {
      const backupCodes = await authService.regenerateBackupCodes({ token });
      return { backupCodes };
    } catch (error) {
      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });

  api.get("/auth/session", async (request, reply) => {
    try {
      return requireAuth(request);
    } catch (error) {
      clearAuthCookie(reply, options.runtime.appEnv);
      throw error;
    }
  });

  api.post("/auth/logout", async (request, reply) => {
    const token = readAuthCookie(request);

    if (!token) {
      clearAuthCookie(reply, options.runtime.appEnv);
      throw unauthenticated("Authentication required.");
    }

    try {
      await authService.logout({ token });
      clearAuthCookie(reply, options.runtime.appEnv);
      reply.code(204);
      return reply.send();
    } catch (error) {
      clearAuthCookie(reply, options.runtime.appEnv);

      if (isAuthnError(error)) {
        mapAuthnError(error);
      }

      throw error;
    }
  });
};
```

Update the error logging block in `apps/api/src/server.ts`:

```ts
import {
  createLogger,
  createNoopTracer,
  extendObservabilityContext,
  sanitizeProblemInstance,
  serializeErrorForLog,
  type ObservabilityTracer,
  type VisionLogger,
} from "@vision/observability";

requestLogger.error("request.failed", {
  method: request.method,
  route: sanitizeProblemInstance(request.routeOptions.url ?? request.url),
  statusCode,
  problem,
  error: serializeErrorForLog(error),
});
```

- [ ] **Step 4: Run the auth-routes test to verify it passes**

Run:

```powershell
$env:APP_ENV='test'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
$env:AUTH_MFA_ENCRYPTION_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
$env:AUTH_MFA_ENCRYPTION_KEY_VERSION='v1'
pnpm --filter @vision/api test -- src/auth-routes.test.ts
```

Expected: PASS with the new pending-login, enrollment, and insufficient-assurance tests green.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/auth-plugin.ts apps/api/src/auth-routes.test.ts apps/api/src/server.ts
git commit -m "feat: add auth api mfa and assurance routes"
```

## Task 4: Update Security Docs and Run Full Verification

**Files:**
- Create: `docs/security/mfa-and-assurance.md`
- Modify: `docs/security/README.md`
- Modify: `docs/security/logging-and-error-safety.md`

- [ ] **Step 1: Write the living security docs**

Create `docs/security/mfa-and-assurance.md`:

```md
# MFA And Assurance

Phase 6 introduces real MFA and assurance enforcement for sensitive internal roles.

## Sensitive Internal Marker

This phase uses a temporary `internal_sensitivity` marker on auth subjects:

- `none`
- `platform_admin`
- `tenant_owner`
- `branch_manager`

This field exists only for MFA policy and audit clarity in Phase 6. It is not the authorization model.

## Assurance Levels

Sessions now support:

- `basic`
- `mfa_verified`
- `step_up_verified`

The order is strict:

`basic < mfa_verified < step_up_verified`

`assurance_updated_at` records when the current assurance level was granted or refreshed.

## Login Behavior

- customers still receive a normal `basic` session
- non-sensitive internal users still receive a normal `basic` session
- sensitive internal users receive a short-lived assurance challenge after password verification
- a real auth cookie is only issued after MFA verification succeeds

## Supported Factors

- TOTP
- one-time backup codes

TOTP secrets are encrypted at rest. Backup codes are hashed at rest and shown only at generation time.

## Step-Up

Step-up uses the same assurance challenge primitive as login MFA, but it is bound to an existing authenticated session.

Phase 6 supports step-up reasons for:

- `tenant_context_switch`
- `support_grant_activation`
- `website_management_write`
- `data_export`
- `credential_reset`

## Boundary

Phase 6 owns authentication strength only.
Phase 7 owns authorization decisions.
```

Update `docs/security/README.md`:

```md
# Security

This folder contains security model notes for Vision.

Security decisions must preserve:

- tenant isolation
- centralized authorization
- database-backed sessions
- MFA and assurance levels for sensitive internal roles
- grant-based support access
- auditability for sensitive operations

Current implementation notes:

- [MFA And Assurance](./mfa-and-assurance.md)
- [Logging And Error Safety](./logging-and-error-safety.md)
- [Secrets Strategy](./secrets-strategy.md)

The full security target is defined in `Vision_Greenfield_Blueprint.md` and `agent.md`.
```

Update `docs/security/logging-and-error-safety.md`:

```md
## Log Safety Rules

- Do not log secrets.
- Do not log passwords.
- Do not log raw MFA material.
- Do not log challenge tokens.
- Do not log raw backup codes.
- Do not dump full exception objects into default logs.
- Do not log unnecessary PII.
```

- [ ] **Step 2: Run targeted Phase 6 verification**

Run:

```powershell
docker compose up -d postgres
$env:APP_ENV='local'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
$env:DATABASE_ADMIN_URL='postgresql://vision_local:vision_local_password@localhost:5433/postgres'
$env:DATABASE_ADMIN_TARGET_DB='vision_local'
$env:API_HOST='0.0.0.0'
$env:API_PORT='4000'
$env:AUTH_MFA_ENCRYPTION_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
$env:AUTH_MFA_ENCRYPTION_KEY_VERSION='v1'
$env:LOG_LEVEL='info'
pnpm db:reset
pnpm --filter @vision/config test -- src/index.test.ts
pnpm --filter @vision/authn test -- src/assurance.test.ts src/mfa.test.ts src/service.integration.test.ts
pnpm --filter @vision/api test -- src/auth-routes.test.ts
```

Expected: database reset succeeds and all targeted tests pass with `0 failed`.

- [ ] **Step 3: Run repo-wide verification**

Run:

```powershell
$env:APP_ENV='local'
$env:DATABASE_URL='postgresql://vision_local:vision_local_password@localhost:5433/vision_local'
$env:DATABASE_ADMIN_URL='postgresql://vision_local:vision_local_password@localhost:5433/postgres'
$env:DATABASE_ADMIN_TARGET_DB='vision_local'
$env:API_HOST='0.0.0.0'
$env:API_PORT='4000'
$env:AUTH_MFA_ENCRYPTION_KEY='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
$env:AUTH_MFA_ENCRYPTION_KEY_VERSION='v1'
$env:LOG_LEVEL='info'
pnpm test
pnpm lint
pnpm typecheck
```

Expected: all three commands exit `0`.

- [ ] **Step 4: Evaluate the Phase 6 roadmap exit criteria explicitly**

Use this checklist and report the result line-by-line:

```md
- [ ] MFA enrollment flow exists
- [ ] MFA verification flow exists
- [ ] backup codes are generated and single-use
- [ ] backup codes are not stored plaintext
- [ ] TOTP secrets are encrypted at rest
- [ ] assurance levels support `basic`, `mfa_verified`, and `step_up_verified`
- [ ] sensitive internal login does not issue a password-only session
- [ ] protected actions fail with `403 insufficient_assurance` when assurance is too low
- [ ] step-up hooks exist for future sensitive actions
- [ ] MFA and assurance events are auditable
```

Decision rule:

- If every item above is true after fresh verification, report that the Phase 6 slice is complete.
- If any item is false, report that the Phase 6 slice is incomplete and list the exact remaining gap.

- [ ] **Step 5: Commit**

```powershell
git add docs/security/mfa-and-assurance.md docs/security/README.md docs/security/logging-and-error-safety.md
git commit -m "docs: record phase 6 mfa and assurance model"
```
