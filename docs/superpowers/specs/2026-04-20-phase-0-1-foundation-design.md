# Phase 0 + Phase 1 Foundation Design

## Purpose

This design defines the first implementation slice for Vision: Phase 0 program setup and Phase 1 monorepo skeleton.

The goal is to turn the current folder into a disciplined project foundation that matches the authority documents before any product features are built.

## Scope

This slice covers:

- Phase 0 control documents and project governance structure.
- Phase 1 monorepo skeleton and toolchain baseline.
- Placeholder applications for all required trust surfaces.
- Placeholder shared packages for the required architecture boundaries.
- Basic scripts for installation, development, typechecking, linting, testing, and CI.

This slice does not cover:

- Authentication implementation.
- Authorization implementation.
- Tenancy implementation.
- Database schema or migrations.
- Booking, ERP, POS, inventory, support, or reporting features.
- Real UI beyond identifying each application surface.

## Authority Documents

The repository root will preserve these control documents:

- `agent.md`
- `Vision_Greenfield_Blueprint.md`
- `VISION_MASTER_PRODUCT_SPEC.md`
- `VISION_DAY_ZERO_IMPLEMENTATION_ROADMAP.md`

`agent.md` is treated as the execution operating manual for the build agent. The blueprint remains the architectural constitution, the product spec remains the product behavior source, and the roadmap remains the phase-order source.

## Phase 0 Design

Phase 0 establishes the written control layer for future implementation.

The implementation will create:

- `docs/architecture/`
- `docs/security/`
- `docs/adr/`
- `docs/project/`
- `.github/pull_request_template.md`

The initial docs will define:

- repository standards
- naming conventions
- module boundary rules
- pull request expectations
- decision-record discipline
- first architecture decision records for modular monolith, app split, PostgreSQL, Fastify, Next.js, centralized authorization, and RLS

The docs will not duplicate the full existing blueprint. They will point to the authority documents and extract only the operating rules needed by contributors and AI agents.

## Phase 1 Design

Phase 1 establishes the workspace shape from the blueprint.

The repository will use:

- `pnpm` workspaces
- Turborepo
- TypeScript
- Next.js for `web`, `erp`, and `platform`
- Fastify for `api`
- a TypeScript worker app for `worker`
- Vitest for baseline package and service tests

The root will include:

- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.base.json`
- `.gitignore`
- `.editorconfig`
- `.prettierrc.json`
- `eslint.config.mjs`
- `.github/workflows/ci.yml`

## Application Structure

The implementation will create these apps:

- `apps/web`: public booking website and customer account surface.
- `apps/erp`: tenant internal ERP surface.
- `apps/platform`: platform admin console surface.
- `apps/api`: backend HTTP API.
- `apps/worker`: asynchronous worker process.

The three frontend apps will each have minimal Next.js placeholders that clearly identify the surface and do not simulate product workflows.

The API app will expose a minimal Fastify server with a health route only.

The worker app will expose a minimal typed worker entry point that starts and logs a placeholder lifecycle message.

## Package Structure

The implementation will create these packages:

- `packages/ui`
- `packages/design-system`
- `packages/config`
- `packages/db`
- `packages/validation`
- `packages/authn`
- `packages/authz`
- `packages/tenancy`
- `packages/observability`
- `packages/contracts`
- `packages/test-utils`

Each package will have:

- `package.json`
- `src/index.ts`
- `tsconfig.json`
- a minimal exported type or function proving the package compiles

Package content will stay intentionally shallow. Security, tenancy, database, and domain behavior belong to later roadmap phases.

## Scripts

The root project will define:

- `dev`: run app development tasks through Turborepo
- `build`: build all workspaces
- `typecheck`: typecheck all workspaces
- `lint`: lint all workspaces
- `test`: run baseline tests
- `format`: format supported files

Each app and package will expose compatible scripts so the Turborepo pipeline works consistently.

## CI Design

The first CI workflow will run on pull requests and pushes to `main`.

The workflow will:

- install pnpm
- install dependencies
- run typecheck
- run lint
- run tests

CI is intentionally limited to Phase 1 expectations. Later phases will add migration checks, security regression tests, integration tests, and end-to-end tests.

## Testing Design

Phase 1 testing proves the skeleton is coherent.

The implementation will include a minimal Vitest setup and at least one baseline test for a shared package. The test should prove the workspace test pipeline runs, not product behavior.

No fake domain tests will be added in this phase.

## Boundaries

The implementation must preserve these boundaries:

- `apps/web`, `apps/erp`, and `apps/platform` are separate trust surfaces.
- `apps/api` owns HTTP backend entry points.
- `apps/worker` owns async worker entry points.
- Shared packages expose only foundation-level placeholders.
- No app reaches into another app.
- No product workflow is represented as real until its roadmap phase.

## Error Handling

Phase 1 will not implement the final error model. The API health route may return a simple structured response. Full API error shape belongs to Phase 4.

## Security Position

This slice does not implement security behavior, but it must not create insecure fake behavior.

The implementation must avoid:

- fake login
- fake roles
- hardcoded tenant assumptions
- hidden admin bypasses
- UI-only permission demonstrations
- pretend booking, POS, or support flows

## Acceptance Criteria

The Phase 0 + Phase 1 slice is acceptable when:

- the root control documents remain present
- `agent.md` is included as a Phase 0 control document
- `docs/architecture`, `docs/security`, and `docs/adr` exist
- the monorepo structure matches the blueprint
- all required apps exist
- all required packages exist
- root scripts are present
- CI workflow exists
- install succeeds
- typecheck succeeds
- lint succeeds
- tests succeed
- no product features or fake security flows are introduced

## Implementation Order

Implementation should proceed in this order:

1. Create Phase 0 docs folders and governance docs.
2. Add root workspace and toolchain configuration.
3. Add shared package skeletons.
4. Add frontend app skeletons.
5. Add API app skeleton.
6. Add worker app skeleton.
7. Add CI workflow.
8. Run install, typecheck, lint, and tests.
9. Commit the Phase 0 + Phase 1 foundation.

## Open Decisions

No open decisions remain for this slice. The user approved following the blueprint stack exactly and including `agent.md` as a Phase 0 control document.
