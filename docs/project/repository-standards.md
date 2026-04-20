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
