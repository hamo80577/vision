# Phase 0 + Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Vision Phase 0 control-document foundation and Phase 1 monorepo skeleton exactly aligned to the approved design.

**Architecture:** Keep the repository as a modular monolith workspace with separate public, ERP, platform, API, and worker applications. Shared packages exist as typed boundaries only; no product workflows, fake security, or tenant behavior are introduced in this slice.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript, Next.js, Fastify, Vitest, ESLint flat config, Prettier, GitHub Actions.

---

## File Structure

Create or modify these files:

- Create: `.editorconfig`
- Create: `.github/pull_request_template.md`
- Create: `.github/workflows/ci.yml`
- Create: `.gitignore`
- Create: `.prettierrc.json`
- Create: `eslint.config.mjs`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `turbo.json`
- Create: `vitest.workspace.ts`
- Create: `docs/architecture/README.md`
- Create: `docs/architecture/module-boundaries.md`
- Create: `docs/security/README.md`
- Create: `docs/security/security-baseline.md`
- Create: `docs/project/repository-standards.md`
- Create: `docs/project/naming-conventions.md`
- Create: `docs/adr/README.md`
- Create: `docs/adr/0001-modular-monolith.md`
- Create: `docs/adr/0002-separate-trust-surface-apps.md`
- Create: `docs/adr/0003-typescript-next-fastify-postgresql.md`
- Create: `docs/adr/0004-centralized-authorization-and-rls.md`
- Modify: `agent.md` by adding it to Git tracking without editing content
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/design-system/package.json`
- Create: `packages/design-system/tsconfig.json`
- Create: `packages/design-system/src/index.ts`
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/index.ts`
- Create: `packages/validation/package.json`
- Create: `packages/validation/tsconfig.json`
- Create: `packages/validation/src/index.ts`
- Create: `packages/authn/package.json`
- Create: `packages/authn/tsconfig.json`
- Create: `packages/authn/src/index.ts`
- Create: `packages/authz/package.json`
- Create: `packages/authz/tsconfig.json`
- Create: `packages/authz/src/index.ts`
- Create: `packages/tenancy/package.json`
- Create: `packages/tenancy/tsconfig.json`
- Create: `packages/tenancy/src/index.ts`
- Create: `packages/observability/package.json`
- Create: `packages/observability/tsconfig.json`
- Create: `packages/observability/src/index.ts`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/test-utils/package.json`
- Create: `packages/test-utils/tsconfig.json`
- Create: `packages/test-utils/src/index.ts`
- Create: `packages/test-utils/src/index.test.ts`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/server.test.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/globals.css`
- Create: `apps/erp/package.json`
- Create: `apps/erp/tsconfig.json`
- Create: `apps/erp/next-env.d.ts`
- Create: `apps/erp/next.config.mjs`
- Create: `apps/erp/app/layout.tsx`
- Create: `apps/erp/app/page.tsx`
- Create: `apps/erp/app/globals.css`
- Create: `apps/platform/package.json`
- Create: `apps/platform/tsconfig.json`
- Create: `apps/platform/next-env.d.ts`
- Create: `apps/platform/next.config.mjs`
- Create: `apps/platform/app/layout.tsx`
- Create: `apps/platform/app/page.tsx`
- Create: `apps/platform/app/globals.css`

Do not move or rename the existing authority documents.

---

## Task 1: Confirm Baseline and Tool Availability

**Files:**
- Read: `agent.md`
- Read: `docs/superpowers/specs/2026-04-20-phase-0-1-foundation-design.md`

- [ ] **Step 1: Check Git and workspace state**

Run:

```powershell
git status --short --branch
rg --files --hidden -g '!node_modules' -g '!dist' -g '!build' -g '!coverage' -g '!.git'
```

Expected:

```text
## main...origin/main
?? agent.md
VISION_MASTER_PRODUCT_SPEC.md
Vision_Greenfield_Blueprint.md
VISION_DAY_ZERO_IMPLEMENTATION_ROADMAP.md
agent.md
docs\superpowers\specs\2026-04-20-phase-0-1-foundation-design.md
```

- [ ] **Step 2: Check Node and Corepack**

Run:

```powershell
node --version
corepack --version
```

Expected: Node and Corepack both print versions. Node `v22.18.0` and Corepack `0.33.0` were present when this plan was written.

---

## Task 2: Add Phase 0 Governance Docs

**Files:**
- Add: `.github/pull_request_template.md`
- Add: `docs/architecture/README.md`
- Add: `docs/architecture/module-boundaries.md`
- Add: `docs/security/README.md`
- Add: `docs/security/security-baseline.md`
- Add: `docs/project/repository-standards.md`
- Add: `docs/project/naming-conventions.md`
- Add: `docs/adr/README.md`
- Add: `docs/adr/0001-modular-monolith.md`
- Add: `docs/adr/0002-separate-trust-surface-apps.md`
- Add: `docs/adr/0003-typescript-next-fastify-postgresql.md`
- Add: `docs/adr/0004-centralized-authorization-and-rls.md`
- Track: `agent.md`

- [ ] **Step 1: Create the pull request template**

Create `.github/pull_request_template.md`:

```markdown
## Problem

Describe the problem this change solves.

## Scope

Describe the exact implementation scope.

## Security Impact

Describe any authn, authz, tenancy, support access, audit, or data exposure impact.

## Data Model Impact

Describe schema, migration, seed, or persistence impact.

## Tests Added

List test commands and coverage added for this change.

## Docs Updated

List docs updated, or explain why no docs update was needed.

## Phase Alignment

Name the roadmap phase this change belongs to.
```

- [ ] **Step 2: Create architecture docs**

Create `docs/architecture/README.md`:

```markdown
# Architecture

This folder contains architecture notes that support the Vision authority documents.

Authority order:

1. `agent.md`
2. `Vision_Greenfield_Blueprint.md`
3. `VISION_MASTER_PRODUCT_SPEC.md`
4. `VISION_DAY_ZERO_IMPLEMENTATION_ROADMAP.md`

These docs summarize current implementation decisions. They do not replace the root authority documents.
```

Create `docs/architecture/module-boundaries.md`:

```markdown
# Module Boundaries

Vision is built as a modular monolith.

Application boundaries:

- `apps/web` owns the public booking and customer account surface.
- `apps/erp` owns tenant internal operations.
- `apps/platform` owns platform administration.
- `apps/api` owns backend HTTP routes.
- `apps/worker` owns asynchronous jobs.

Package boundaries:

- Shared packages expose reusable primitives only.
- Apps must not import from other apps.
- Backend route handlers must not become business logic containers.
- Product workflows must be implemented in the proper roadmap phase.
```

- [ ] **Step 3: Create security docs**

Create `docs/security/README.md`:

```markdown
# Security

This folder contains security model notes for Vision.

Security decisions must preserve:

- tenant isolation
- centralized authorization
- database-backed sessions
- MFA and assurance levels for sensitive internal roles
- grant-based support access
- auditability for sensitive operations

The full security target is defined in `Vision_Greenfield_Blueprint.md` and `agent.md`.
```

Create `docs/security/security-baseline.md`:

```markdown
# Security Baseline

Phase 0 and Phase 1 do not implement authentication, authorization, tenancy, or database isolation.

This phase must also not create fake security behavior.

Forbidden in the foundation slice:

- fake login flows
- fake role checks
- hardcoded tenant assumptions
- hidden support or admin bypasses
- UI-only permission demonstrations
- pretend booking, POS, inventory, support, or reporting flows

Later security phases must add real server-side enforcement and tests.
```

- [ ] **Step 4: Create project docs**

Create `docs/project/repository-standards.md`:

```markdown
# Repository Standards

Vision uses a pnpm and Turborepo monorepo.

Required checks for normal changes:

- install dependencies
- typecheck
- lint
- test

Structural changes must update docs when they affect:

- app boundaries
- package boundaries
- authn or authz assumptions
- tenancy assumptions
- database structure
- support access behavior
- phase sequencing

Do not add product features outside the active roadmap phase without explicit approval.
```

Create `docs/project/naming-conventions.md`:

```markdown
# Naming Conventions

Workspace packages use the `@vision/*` scope.

Applications:

- `@vision/web`
- `@vision/erp`
- `@vision/platform`
- `@vision/api`
- `@vision/worker`

Shared packages:

- `@vision/ui`
- `@vision/design-system`
- `@vision/config`
- `@vision/db`
- `@vision/validation`
- `@vision/authn`
- `@vision/authz`
- `@vision/tenancy`
- `@vision/observability`
- `@vision/contracts`
- `@vision/test-utils`

Use explicit domain names. Avoid generic dumping grounds such as `utils` for architecture-level behavior.
```

- [ ] **Step 5: Create ADR docs**

Create `docs/adr/README.md`:

```markdown
# Architecture Decision Records

ADRs capture durable architecture decisions.

Use this format:

- status
- context
- decision
- consequences

Root authority documents still control the product and architecture direction.
```

Create `docs/adr/0001-modular-monolith.md`:

```markdown
# ADR 0001: Modular Monolith

Status: Accepted

## Context

Vision needs strong consistency, central security logic, and fast iteration.

## Decision

Build Vision as a modular monolith with one backend API, one worker, separate frontend apps, and strict internal boundaries.

## Consequences

The project avoids microservice complexity during the foundation and early product phases. Module boundaries must be enforced by structure, reviews, and tests.
```

Create `docs/adr/0002-separate-trust-surface-apps.md`:

```markdown
# ADR 0002: Separate Trust Surface Apps

Status: Accepted

## Context

Vision has public customer, tenant ERP, and platform administration surfaces with different trust boundaries.

## Decision

Use three separate Next.js apps: `apps/web`, `apps/erp`, and `apps/platform`.

## Consequences

The public, tenant, and platform surfaces remain structurally separate. Shared UI must live in packages, not by importing between apps.
```

Create `docs/adr/0003-typescript-next-fastify-postgresql.md`:

```markdown
# ADR 0003: TypeScript, Next.js, Fastify, and PostgreSQL

Status: Accepted

## Context

Vision needs typed full-stack development, public SSR capability, controlled backend behavior, and transactional persistence.

## Decision

Use TypeScript, Next.js for frontend apps, Fastify for the API, and PostgreSQL for production persistence.

## Consequences

The initial skeleton must prepare these boundaries without implementing later database or domain phases early.
```

Create `docs/adr/0004-centralized-authorization-and-rls.md`:

```markdown
# ADR 0004: Centralized Authorization and Row-Level Security

Status: Accepted

## Context

Vision is multi-tenant and must not rely on UI visibility or scattered role checks.

## Decision

Authorization will be centralized in `packages/authz`, and critical tenant-scoped tables will use PostgreSQL row-level security in later phases.

## Consequences

Phase 1 creates package boundaries only. Real authorization, tenancy context, and RLS are implemented in their roadmap phases with tests.
```

- [ ] **Step 6: Verify Phase 0 files exist**

Run:

```powershell
Test-Path -LiteralPath 'docs/architecture'
Test-Path -LiteralPath 'docs/security'
Test-Path -LiteralPath 'docs/adr'
Test-Path -LiteralPath 'docs/project'
Test-Path -LiteralPath '.github/pull_request_template.md'
```

Expected:

```text
True
True
True
True
True
```

- [ ] **Step 7: Commit Phase 0 governance docs**

Run:

```powershell
git add -- agent.md .github/pull_request_template.md docs/architecture docs/security docs/project docs/adr
git commit -m "docs: establish phase 0 governance"
```

Expected: commit succeeds and includes `agent.md`.

---

## Task 3: Add Root Workspace Tooling

**Files:**
- Add: `.editorconfig`
- Add: `.gitignore`
- Add: `.prettierrc.json`
- Add: `eslint.config.mjs`
- Add: `package.json`
- Add: `pnpm-workspace.yaml`
- Add: `tsconfig.base.json`
- Add: `turbo.json`
- Add: `vitest.workspace.ts`

- [ ] **Step 1: Create root package and workspace files**

Create `package.json`:

```json
{
  "name": "vision",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@eslint/js": "latest",
    "@types/node": "latest",
    "eslint": "latest",
    "prettier": "latest",
    "tsup": "latest",
    "tsx": "latest",
    "turbo": "latest",
    "typescript": "latest",
    "typescript-eslint": "latest",
    "vitest": "latest"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "outputs": ["coverage/**"]
    },
    "format": {
      "cache": false
    }
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "jsx": "preserve",
    "types": ["node"]
  }
}
```

Create `vitest.workspace.ts`:

```typescript
import { defineWorkspace } from "vitest/config";

export default defineWorkspace(["apps/api", "packages/*"]);
```

- [ ] **Step 2: Create formatter, ignore, and lint files**

Create `.editorconfig`:

```editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

Create `.gitignore`:

```gitignore
node_modules
.turbo
.next
dist
coverage
.env
.env.*
!.env.example
*.log
pnpm-lock.yaml
```

Create `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

Create `eslint.config.mjs`:

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_"
        }
      ]
    }
  }
];
```

- [ ] **Step 3: Enable pnpm through Corepack**

Run:

```powershell
corepack enable
corepack use pnpm@latest
```

Expected: `package.json` is updated with a `packageManager` entry and pnpm becomes available.

- [ ] **Step 4: Install root dependencies**

Run:

```powershell
pnpm install
```

Expected: dependencies install successfully and `pnpm-lock.yaml` is created.

- [ ] **Step 5: Keep the lockfile tracked**

Modify `.gitignore` to remove the `pnpm-lock.yaml` line so the lockfile is committed.

Final `.gitignore`:

```gitignore
node_modules
.turbo
.next
dist
coverage
.env
.env.*
!.env.example
*.log
```

- [ ] **Step 6: Verify root scripts exist**

Run:

```powershell
pnpm run
```

Expected: output lists `dev`, `build`, `typecheck`, `lint`, `test`, and `format`.

- [ ] **Step 7: Commit root tooling**

Run:

```powershell
git add -- .editorconfig .gitignore .prettierrc.json eslint.config.mjs package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json vitest.workspace.ts
git commit -m "chore: add monorepo toolchain"
```

Expected: commit succeeds.

---

## Task 4: Add Shared Package Skeletons with a Baseline Test

**Files:**
- Add: every `packages/*/package.json`
- Add: every `packages/*/tsconfig.json`
- Add: every `packages/*/src/index.ts`
- Add: `packages/test-utils/src/index.test.ts`

- [ ] **Step 1: Create shared package configs and an intentionally failing test**

For each package, create this `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "noEmit": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

Create these `package.json` files:

For `packages/ui/package.json`:

```json
{
  "name": "@vision/ui",
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
  }
}
```

For `packages/design-system/package.json`:

```json
{
  "name": "@vision/design-system",
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
  }
}
```

For `packages/config/package.json`:

```json
{
  "name": "@vision/config",
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
  }
}
```

For `packages/db/package.json`:

```json
{
  "name": "@vision/db",
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
  }
}
```

For `packages/validation/package.json`:

```json
{
  "name": "@vision/validation",
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
  }
}
```

For `packages/authn/package.json`:

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
  }
}
```

For `packages/authz/package.json`:

```json
{
  "name": "@vision/authz",
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
  }
}
```

For `packages/tenancy/package.json`:

```json
{
  "name": "@vision/tenancy",
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
  }
}
```

For `packages/observability/package.json`:

```json
{
  "name": "@vision/observability",
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
  }
}
```

For `packages/contracts/package.json`:

```json
{
  "name": "@vision/contracts",
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
  }
}
```

For `packages/test-utils/package.json`:

```json
{
  "name": "@vision/test-utils",
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
    "test": "vitest run"
  }
}
```

Create `packages/test-utils/src/index.ts`:

```typescript
export {};
```

Create `packages/test-utils/src/index.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { createTestLabel } from "./index";

describe("createTestLabel", () => {
  it("creates deterministic labels for workspace tests", () => {
    expect(createTestLabel("workspace")).toBe("vision:test:workspace");
  });
});
```

- [ ] **Step 2: Run the baseline test and verify RED**

Run:

```powershell
pnpm --filter @vision/test-utils test
```

Expected: FAIL because `createTestLabel` is not exported from `packages/test-utils/src/index.ts`.

- [ ] **Step 3: Implement the baseline package exports**

Replace `packages/test-utils/src/index.ts`:

```typescript
export function createTestLabel(name: string): string {
  return `vision:test:${name}`;
}
```

Create the remaining package entry files:

```typescript
// packages/ui/src/index.ts
export const uiPackageName = "@vision/ui" as const;
```

```typescript
// packages/design-system/src/index.ts
export const designSystemPackageName = "@vision/design-system" as const;
```

```typescript
// packages/config/src/index.ts
export const configPackageName = "@vision/config" as const;
```

```typescript
// packages/db/src/index.ts
export const dbPackageName = "@vision/db" as const;
```

```typescript
// packages/validation/src/index.ts
export const validationPackageName = "@vision/validation" as const;
```

```typescript
// packages/authn/src/index.ts
export const authnPackageName = "@vision/authn" as const;
```

```typescript
// packages/authz/src/index.ts
export const authzPackageName = "@vision/authz" as const;
```

```typescript
// packages/tenancy/src/index.ts
export const tenancyPackageName = "@vision/tenancy" as const;
```

```typescript
// packages/observability/src/index.ts
export const observabilityPackageName = "@vision/observability" as const;
```

```typescript
// packages/contracts/src/index.ts
export const contractsPackageName = "@vision/contracts" as const;
```

- [ ] **Step 4: Run shared package tests and verify GREEN**

Run:

```powershell
pnpm --filter @vision/test-utils test
```

Expected: PASS with one test passing.

- [ ] **Step 5: Run package typecheck**

Run:

```powershell
pnpm --filter "./packages/*" typecheck
```

Expected: all package typechecks pass.

- [ ] **Step 6: Commit shared package skeletons**

Run:

```powershell
git add -- packages
git commit -m "chore: add shared package skeletons"
```

Expected: commit succeeds.

---

## Task 5: Add API App with Health Route Using TDD

**Files:**
- Add: `apps/api/package.json`
- Add: `apps/api/tsconfig.json`
- Add: `apps/api/src/server.test.ts`
- Add: `apps/api/src/server.ts`
- Add: `apps/api/src/index.ts`

- [ ] **Step 1: Create API package config and failing health test**

Create `apps/api/package.json`:

```json
{
  "name": "@vision/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format esm --dts --out-dir dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "fastify": "latest"
  }
}
```

Create `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "noEmit": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

Create `apps/api/src/server.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildApi } from "./server";

describe("buildApi", () => {
  it("responds to the health route", async () => {
    const api = buildApi();

    const response = await api.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "vision-api",
      status: "ok"
    });

    await api.close();
  });
});
```

- [ ] **Step 2: Install API dependency**

Run:

```powershell
pnpm install
```

Expected: `fastify` is installed for `@vision/api` and the lockfile updates.

- [ ] **Step 3: Run API test and verify RED**

Run:

```powershell
pnpm --filter @vision/api test
```

Expected: FAIL because `apps/api/src/server.ts` does not exist.

- [ ] **Step 4: Implement the health route**

Create `apps/api/src/server.ts`:

```typescript
import Fastify, { type FastifyInstance } from "fastify";

export function buildApi(): FastifyInstance {
  const api = Fastify({
    logger: false
  });

  api.get("/health", async () => ({
    service: "vision-api",
    status: "ok"
  }));

  return api;
}
```

Create `apps/api/src/index.ts`:

```typescript
import { buildApi } from "./server";

const api = buildApi();
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

await api.listen({ host, port }).catch((error: unknown) => {
  api.log.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: Run API test and verify GREEN**

Run:

```powershell
pnpm --filter @vision/api test
```

Expected: PASS with the health route test passing.

- [ ] **Step 6: Commit API app**

Run:

```powershell
git add -- apps/api pnpm-lock.yaml
git commit -m "chore: add api app skeleton"
```

Expected: commit succeeds.

---

## Task 6: Add Frontend App Skeletons

**Files:**
- Add: `apps/web/*`
- Add: `apps/erp/*`
- Add: `apps/platform/*`

- [ ] **Step 1: Create frontend package configs**

Create `apps/web/package.json`:

```json
{
  "name": "@vision/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@types/react": "latest",
    "@types/react-dom": "latest"
  }
}
```

Create `apps/erp/package.json`:

```json
{
  "name": "@vision/erp",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@types/react": "latest",
    "@types/react-dom": "latest"
  }
}
```

Create `apps/platform/package.json`:

```json
{
  "name": "@vision/platform",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3002",
    "build": "next build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@types/react": "latest",
    "@types/react-dom": "latest"
  }
}
```

- [ ] **Step 2: Create frontend TypeScript and Next config files**

For each frontend app, create this `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": false,
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

For each frontend app, create this `next-env.d.ts`:

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file is generated by Next.js conventions and kept in source for the Phase 1 skeleton.
```

For each frontend app, create this `next.config.mjs`:

```javascript
/** @type {import("next").NextConfig} */
const nextConfig = {};

export default nextConfig;
```

- [ ] **Step 3: Create web app files**

Create `apps/web/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vision Web",
  description: "Vision public booking surface"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/web/app/page.tsx`:

```tsx
export default function WebHomePage() {
  return (
    <main className="surface">
      <p className="eyebrow">Public Surface</p>
      <h1>Vision Web</h1>
      <p>Customer booking and account experience starts here after the foundation phases.</p>
    </main>
  );
}
```

Create `apps/web/app/globals.css`:

```css
:root {
  color: #111827;
  background: #f8fafc;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.surface {
  min-height: 100vh;
  display: grid;
  align-content: center;
  gap: 16px;
  padding: 48px;
}

.eyebrow {
  margin: 0;
  color: #0f766e;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
}

h1,
p {
  max-width: 640px;
  margin: 0;
}
```

- [ ] **Step 4: Create ERP app files**

Create `apps/erp/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vision ERP",
  description: "Vision tenant ERP surface"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/erp/app/page.tsx`:

```tsx
export default function ErpHomePage() {
  return (
    <main className="surface">
      <p className="eyebrow">Tenant Surface</p>
      <h1>Vision ERP</h1>
      <p>Tenant operations will be built here after auth, tenancy, and domain foundations exist.</p>
    </main>
  );
}
```

Create `apps/erp/app/globals.css`:

```css
:root {
  color: #172554;
  background: #f9fafb;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.surface {
  min-height: 100vh;
  display: grid;
  align-content: center;
  gap: 16px;
  padding: 48px;
}

.eyebrow {
  margin: 0;
  color: #047857;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
}

h1,
p {
  max-width: 640px;
  margin: 0;
}
```

- [ ] **Step 5: Create platform app files**

Create `apps/platform/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vision Platform",
  description: "Vision platform administration surface"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/platform/app/page.tsx`:

```tsx
export default function PlatformHomePage() {
  return (
    <main className="surface">
      <p className="eyebrow">Platform Surface</p>
      <h1>Vision Platform</h1>
      <p>Platform operations will be built here after provisioning and support access foundations.</p>
    </main>
  );
}
```

Create `apps/platform/app/globals.css`:

```css
:root {
  color: #18181b;
  background: #f4f4f5;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.surface {
  min-height: 100vh;
  display: grid;
  align-content: center;
  gap: 16px;
  padding: 48px;
}

.eyebrow {
  margin: 0;
  color: #b91c1c;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
}

h1,
p {
  max-width: 640px;
  margin: 0;
}
```

- [ ] **Step 6: Install frontend dependencies**

Run:

```powershell
pnpm install
```

Expected: Next.js, React, React DOM, and React type packages install and the lockfile updates.

- [ ] **Step 7: Typecheck frontend apps**

Run:

```powershell
pnpm --filter @vision/web typecheck
pnpm --filter @vision/erp typecheck
pnpm --filter @vision/platform typecheck
```

Expected: all three commands pass.

- [ ] **Step 8: Commit frontend apps**

Run:

```powershell
git add -- apps/web apps/erp apps/platform pnpm-lock.yaml
git commit -m "chore: add frontend app skeletons"
```

Expected: commit succeeds.

---

## Task 7: Add Worker App Skeleton

**Files:**
- Add: `apps/worker/package.json`
- Add: `apps/worker/tsconfig.json`
- Add: `apps/worker/src/index.ts`

- [ ] **Step 1: Create worker package files**

Create `apps/worker/package.json`:

```json
{
  "name": "@vision/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format esm --dts --out-dir dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run --passWithNoTests"
  }
}
```

Create `apps/worker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "noEmit": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

Create `apps/worker/src/index.ts`:

```typescript
export function getWorkerStatus() {
  return {
    service: "vision-worker",
    status: "idle"
  } as const;
}

console.log(JSON.stringify(getWorkerStatus()));
```

- [ ] **Step 2: Typecheck the worker**

Run:

```powershell
pnpm --filter @vision/worker typecheck
```

Expected: typecheck passes.

- [ ] **Step 3: Commit worker app**

Run:

```powershell
git add -- apps/worker
git commit -m "chore: add worker app skeleton"
```

Expected: commit succeeds.

---

## Task 8: Add CI Workflow

**Files:**
- Add: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  verify:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Enable Corepack
        run: corepack enable

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test
```

- [ ] **Step 2: Commit CI workflow**

Run:

```powershell
git add -- .github/workflows/ci.yml
git commit -m "ci: add foundation verification workflow"
```

Expected: commit succeeds.

---

## Task 9: Final Verification and Foundation Commit Check

**Files:**
- Read: full workspace

- [ ] **Step 1: Run install verification**

Run:

```powershell
pnpm install
```

Expected: install succeeds without dependency resolution errors.

- [ ] **Step 2: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: all workspace typecheck tasks pass.

- [ ] **Step 3: Run lint**

Run:

```powershell
pnpm lint
```

Expected: all workspace lint tasks pass.

- [ ] **Step 4: Run tests**

Run:

```powershell
pnpm test
```

Expected: `@vision/test-utils` and `@vision/api` tests pass; no-test workspaces pass through `--passWithNoTests`.

- [ ] **Step 5: Verify required workspace files**

Run:

```powershell
Test-Path -LiteralPath 'docs/architecture'
Test-Path -LiteralPath 'docs/security'
Test-Path -LiteralPath 'docs/adr'
Test-Path -LiteralPath 'apps/web'
Test-Path -LiteralPath 'apps/erp'
Test-Path -LiteralPath 'apps/platform'
Test-Path -LiteralPath 'apps/api'
Test-Path -LiteralPath 'apps/worker'
Test-Path -LiteralPath 'packages/authz'
Test-Path -LiteralPath 'packages/tenancy'
Test-Path -LiteralPath '.github/workflows/ci.yml'
```

Expected:

```text
True
True
True
True
True
True
True
True
True
True
True
```

- [ ] **Step 6: Verify no product workflows were introduced**

Run:

```powershell
rg -n "login|tenantId|invoice|support grant|superadmin|role ===|fake auth" apps packages
```

Expected: no matches that indicate fake auth, tenant, invoice, support-grant, or role behavior.

- [ ] **Step 7: Check final Git state**

Run:

```powershell
git status --short
```

Expected: no uncommitted files.

---

## Self-Review Checklist for the Implementer

Before reporting completion:

- [ ] Phase 0 folders exist.
- [ ] `agent.md` is tracked.
- [ ] All required apps exist.
- [ ] All required packages exist.
- [ ] `pnpm install` passed.
- [ ] `pnpm typecheck` passed.
- [ ] `pnpm lint` passed.
- [ ] `pnpm test` passed.
- [ ] API health route test failed before implementation and passed after implementation.
- [ ] Shared test utility test failed before implementation and passed after implementation.
- [ ] No fake auth, tenancy, booking, POS, inventory, support, or reporting flows exist.
