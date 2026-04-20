# Phase 3 Database Foundation Design

## Purpose

This design defines Vision Phase 3: database baseline, migration discipline, and the real `@vision/db` package foundation.

The goal is to establish a production-oriented database workflow before any tenant, auth, booking, ERP, POS, inventory, or support entities are introduced.

## Scope

This slice covers:

- Drizzle ORM and Drizzle Kit as the typed schema and migration toolchain.
- A real `@vision/db` package with connection management, transaction helpers, health checks, and schema exports.
- Root database tooling configuration and scripts.
- Forward-only migration discipline with generated SQL migration files.
- Local database reset and reseed workflow.
- Initial infrastructure-only schema objects needed to prove the workflow.
- CI validation for migration history and migration application.
- Documentation for migration rules and DB role strategy.

This slice does not cover:

- Tenant, branch, customer, booking, appointment, POS, inventory, ticket, or support tables.
- Authentication or authorization tables.
- Row-level security policies.
- Tenant DB context propagation.
- Domain repositories or business services.
- Background job tables or notification outbox behavior.

## Phase Boundary

Phase 3 owns the database foundation only.

Phase 4 and later will build on top of this by adding:

- observability around DB-backed request flows
- sessions and authn tables
- centralized authz persistence where required
- tenancy context and RLS
- real business entities

Phase 3 may create infrastructure-only schema artifacts so migrations, seeding, and reset behavior can be exercised for real. It must not smuggle in product domain schema.

## Approved Approach

The approved approach is:

- use `drizzle-orm` with PostgreSQL and the `pg` driver
- use `drizzle-kit generate` to create SQL migrations from typed schema
- use `drizzle-kit migrate` to apply generated migrations
- use `drizzle-kit check` in CI to validate migration history consistency
- treat production and shared environments as forward-only migrations
- use a destructive local reset script instead of generated down migrations

This aligns with the blueprint choice of Drizzle plus explicit SQL visibility and avoids inventing a custom migration framework.

## Database Package Design

`packages/db` will become the database foundation package instead of a placeholder.

The package will expose:

- a typed Drizzle database client factory backed by `pg.Pool`
- a pool factory and pool shutdown helper
- a typed database health check helper
- a transaction helper that wraps `db.transaction(...)`
- schema exports
- DB tooling config helpers for migration and seed scripts

The package should stay infrastructure-focused. It must not become a dumping ground for repositories or domain rules.

## Initial Package Shape

The implementation is expected to introduce a structure close to:

```text
packages/db/
  src/
    client.ts
    config.ts
    health.ts
    index.ts
    schema/
      app-metadata.ts
      index.ts
    transactions.ts
```

The exact filenames may vary slightly if the existing repository patterns suggest a cleaner equivalent, but the boundaries must remain explicit.

## Schema Baseline

Phase 3 needs one minimal schema baseline so the migration, seed, reset, and health workflows are real.

The initial schema should remain infrastructure-only. The first table will be `app_metadata`, with a deliberately narrow purpose:

- store key/value runtime bootstrap metadata
- prove seed and reset behavior
- give tests and tooling a stable non-domain object to verify

The baseline must not introduce tenant-scoped or product-scoped entities yet.

## Migration Workflow

Migration discipline is the core deliverable of this phase.

The workflow will be:

1. Edit typed schema in `packages/db/src/schema`.
2. Generate SQL with a named migration using Drizzle Kit.
3. Review the generated SQL before committing it.
4. Apply migrations with `drizzle-kit migrate`.
5. Run seed logic if local bootstrap data is needed.

Root scripts should include a set equivalent to:

- `db:generate`
- `db:migrate`
- `db:seed`
- `db:reset`
- `db:check`

`db:reset` is the accepted equivalent to down migrations for this project’s local workflow. It should destroy and recreate the local development database, then replay forward migrations and seeds.

## Migration Rules

The documentation added in this phase must make these rules explicit:

- no manual schema edits in shared or production environments
- no ad hoc schema changes without a checked-in migration
- no `drizzle-kit push` as the standard project workflow
- generated SQL must be reviewed before merge
- destructive changes require a controlled plan, not casual editing
- local resets are allowed only for local or disposable databases
- production rollback strategy is not "run down migrations"; it is controlled forward fixes plus backup and restore discipline

## Runtime and Admin DB Role Strategy

This phase will establish the connection boundary that later hardening phases will enforce more strictly.

The design should distinguish:

- `DATABASE_URL` for runtime application access
- `DATABASE_ADMIN_URL` for migrations, reset, and other admin-only tooling

In local development both URLs may use the same PostgreSQL role for practicality, but they must remain separate configuration concepts now so the runtime/admin split is already visible in code and docs.

The runtime application path must not assume superuser or schema-owner privileges. Later phases will harden that separation.

## Local Reset and Seed Strategy

The repository already uses Docker Compose with local PostgreSQL. Phase 3 will add a deterministic reset flow.

The reset flow will:

1. connect through the admin database URL
2. connect to the PostgreSQL maintenance database and drop/recreate the local application database in local or test environments
3. apply all forward migrations
4. run the seed script

The seed data must stay infrastructure-only. It will insert a small set of deterministic rows into `app_metadata` to prove the seed mechanism without pretending to be tenant provisioning or business seed data.

## API and Worker Relationship

Phase 3 will make the DB layer available to the repository, but it does not need to wire API or worker startup to open persistent DB connections during normal boot yet.

If a small DB health probe helper or tooling entry point is added, it should remain clearly isolated from product behavior. The API and worker must not suddenly gain domain persistence logic in this phase.

## CI Validation

CI must expand beyond typecheck, lint, and test to include database migration validation.

The CI flow for this phase should:

- start a PostgreSQL service container
- provide database environment variables for tooling
- run migration consistency checks
- apply migrations to a clean database
- run the seed script if the workflow depends on seeded infrastructure metadata

This gives real proof that checked-in migrations are usable from a clean state.

## Testing

Testing for this phase should focus on foundation behavior rather than product logic.

Relevant proof points include:

- unit tests for DB tooling/config helpers where the behavior is non-trivial
- tests for transaction helper behavior where it can be exercised safely
- migration smoke verification through real commands in CI
- local verification that reset, migrate, and seed complete successfully

The key requirement is proving the workflow, not inventing domain tests early.

## Documentation

Phase 3 should add or update documentation in these areas:

- local development instructions for migrate/reset/seed usage
- migration discipline and review rules
- DB role strategy and the distinction between runtime and admin connections
- any structural changes to repository standards caused by the database foundation

The docs must make clear that business schema begins in later phases and that this phase is deliberately narrow.

## Acceptance Criteria

Phase 3 is acceptable when:

- `@vision/db` is a real package, not a placeholder
- Drizzle configuration exists in the repository
- typed schema files exist under `packages/db`
- generated SQL migrations live in `db/migrations`
- a seed structure exists under `db/seeds`
- root scripts support generate, migrate, seed, reset, and check flows
- local reset and reseed works from a clean local database
- CI validates migration history and migration application
- docs explain migration discipline and DB role strategy
- no business-domain tables or later-phase security behavior are introduced

## Implementation Order

Implementation should proceed in this order:

1. add the DB dependencies and Drizzle configuration
2. add failing tests or verification targets for DB tooling where useful
3. implement `@vision/db` connection, health, transaction, and schema exports
4. add the minimal infrastructure-only schema and generate the baseline migration
5. add seed and reset scripts
6. update CI for database validation
7. update docs for migration discipline and local DB workflow
8. run install, typecheck, lint, tests, and DB workflow verification
9. commit the Phase 3 database foundation

## Open Decisions

No open decisions remain for this slice.

The approved implementation target is a narrow Phase 3 database foundation using Drizzle, generated SQL migrations, explicit admin vs runtime connection boundaries, local reset/reseed tooling, and CI migration validation without introducing business schema early.
