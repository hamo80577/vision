# Database Foundation

Vision Phase 3 establishes the database foundation before product-domain schema exists.

## Source Of Truth

- Typed schema lives in `packages/db/src/schema`.
- SQL migrations live in `db/migrations`.
- Drizzle Kit configuration lives in `drizzle.config.ts`.

## Workflow

1. Update schema files in `packages/db/src/schema`.
2. Generate a named migration with `pnpm db:generate --name=change_name`.
3. Review the generated SQL.
4. Apply migrations with `pnpm db:migrate`.
5. Seed infrastructure-only rows with `pnpm db:seed`.

## Reset

`pnpm db:reset` is allowed only in local or test environments. It drops and recreates the local application database, reapplies migrations, and reruns seeds.

## Current Baseline

Phase 3 creates only one infrastructure-only table:

- `app_metadata`

It exists to prove migration, seed, reset, and health-check workflows. It is not a business-domain table.

## Migration Rules

- Do not edit shared or production schema manually.
- Do not use ad hoc schema changes without a checked-in migration.
- Do not use `drizzle-kit push` as the normal team workflow.
- Review generated SQL before merge.
- Treat destructive schema changes as planned work, not casual edits.
