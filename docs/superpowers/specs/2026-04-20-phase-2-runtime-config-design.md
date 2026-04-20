# Phase 2 Runtime Configuration Design

## Purpose

This design defines Vision Phase 2: local infrastructure and runtime configuration.

The goal is to make the project boot safely and predictably in local development, while establishing one typed configuration path for later phases.

## Scope

This slice covers:

- Local Docker Compose infrastructure for PostgreSQL.
- A root `.env.example` file.
- Typed runtime configuration in `@vision/config`.
- Environment contracts for API, worker, and frontend apps.
- API and worker startup using validated config instead of direct raw environment reads.
- Documentation for local development and secrets strategy.
- Tests proving config validation behavior.

This slice does not cover:

- Database schema.
- Drizzle setup.
- Migration generation or migration execution.
- Runtime database connection pools.
- Tenant, auth, booking, ERP, POS, inventory, or support behavior.
- Object storage service setup unless a later phase creates a real need.

## Phase Boundary

Phase 2 owns local infrastructure and configuration safety.

Phase 3 will own:

- database package implementation
- migration workflow
- schema management discipline
- transaction helpers
- database connection management

Phase 2 may define database URLs and local PostgreSQL service details, but it must not implement schema or migration behavior.

## Local Infrastructure

The implementation will add `compose.yaml` with one local dependency:

- PostgreSQL

The local PostgreSQL service will use stable local defaults:

- host port: `5432`
- database: `vision_local`
- user: `vision_local`
- password: `vision_local_password`

These defaults are allowed only for local development. They must not be accepted silently for staging or production runtime configuration.

The compose file will include:

- a named volume for PostgreSQL data
- a healthcheck using `pg_isready`
- explicit environment values matching `.env.example`

## Environment Files

The implementation will add `.env.example` at the repo root.

The example file will document:

- `APP_ENV`
- `API_HOST`
- `API_PORT`
- `DATABASE_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- frontend public API base URL variables

The repository must continue to ignore real `.env` files.

## Config Package

`packages/config` will stop being a name-only package and become the single source of typed runtime configuration.

The package will expose:

- `parseApiConfig(env)`
- `parseWorkerConfig(env)`
- `parseWebConfig(env)`
- `parseErpConfig(env)`
- `parsePlatformConfig(env)`
- related config types
- `ConfigError` or a typed validation error shape suitable for fail-fast boot behavior

The API and worker config loaders will validate server runtime variables.

Frontend config loaders will validate only public frontend variables. They must not introduce secrets into frontend runtime contracts.

## Environment Model

The accepted app environments will be:

- `local`
- `test`
- `staging`
- `production`

Rules:

- `local` may use documented local defaults.
- `test` may use explicit test-safe values.
- `staging` and `production` must reject known local/default secrets.
- missing required variables must fail validation.
- invalid URLs and invalid ports must fail validation.

## API Integration

`apps/api/src/index.ts` currently reads `process.env.PORT` and `process.env.HOST` directly.

Phase 2 will replace that with `parseApiConfig(process.env)`.

The API health route remains unchanged.

No database connection will be opened in the API during Phase 2.

## Worker Integration

`apps/worker/src/index.ts` will import worker config and validate it during startup.

The worker remains a minimal Phase 1 process. It may include the parsed environment name in its internal status if useful, but it must not start jobs, queues, notifications, or database connections.

## Documentation

The implementation will add:

- `docs/project/local-development.md`
- `docs/security/secrets-strategy.md`

`local-development.md` will explain:

- required local tools
- how to copy `.env.example` to `.env`
- how to start PostgreSQL with Docker Compose
- how to run install, typecheck, lint, and tests

`secrets-strategy.md` will explain:

- no real secrets in Git
- local defaults are only for local development
- staging and production secrets must come from environment-specific secret stores
- known local secrets must fail outside local/test contexts

## Testing

Tests will be added under `packages/config`.

The tests will prove:

- valid local API config parses successfully
- missing `DATABASE_URL` fails where required
- invalid `API_PORT` fails
- production config rejects local database password/default URL
- frontend config accepts only public frontend variables

The config tests are the main behavioral proof for Phase 2.

## Security Position

This phase improves boot-time safety but does not implement product security.

The implementation must avoid:

- fake authentication
- fake authorization
- tenant assumptions
- hardcoded platform users
- support bypasses
- real production secrets

The important security behavior in this phase is fail-fast configuration validation.

## Acceptance Criteria

Phase 2 is acceptable when:

- `compose.yaml` exists and defines local PostgreSQL.
- `.env.example` exists and documents required local variables.
- real `.env` files remain ignored.
- `@vision/config` validates API, worker, and frontend app config.
- config tests pass.
- API startup uses `@vision/config`.
- worker startup uses `@vision/config`.
- docs explain local development and secrets strategy.
- install, typecheck, lint, and tests pass.
- no schema, migration, tenant, auth, booking, POS, inventory, or support behavior is introduced.

## Implementation Order

Implementation should proceed in this order:

1. Add local infrastructure files and docs.
2. Add failing config validation tests.
3. Implement `@vision/config` schemas and parsers.
4. Wire API startup to validated config.
5. Wire worker startup to validated config.
6. Run install, typecheck, lint, and tests.
7. Commit the Phase 2 runtime configuration foundation.

## Open Decisions

No open decisions remain for this slice. The approved approach is strict Phase 2 only: local PostgreSQL, typed runtime config, app config contracts, and documentation, with database schema and migrations deferred to Phase 3.
