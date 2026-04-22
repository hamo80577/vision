# Local Development

Vision local development uses pnpm, Docker Compose, and a local PostgreSQL container.

## Required Tools

- Node.js compatible with the repository toolchain
- Corepack
- Docker Desktop or another Docker Compose compatible runtime

## Environment File

Create a local environment file from the tracked example:

```powershell
Copy-Item .env.example .env
```

Real `.env` files are ignored by Git. Keep local values local.

The tracked example includes the default structured log level used by API and worker processes:

```text
LOG_LEVEL=info
```

Override it locally when you need more or less detail, for example:

```text
LOG_LEVEL=debug
```

## PostgreSQL

The Docker service maps container port `5432` to host port `5433` so it can run beside a native PostgreSQL install that already owns `5432`.

Start the local database:

```powershell
docker compose up -d postgres
```

Check that PostgreSQL is healthy:

```powershell
docker compose exec -T postgres pg_isready -U vision_admin -d postgres
```

Stop the local database:

```powershell
docker compose down
```

The local runtime database URL is:

```text
postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local
```

The local admin database URL is:

```text
postgresql://vision_admin:vision_admin_password@localhost:5433/postgres
```

The local admin target database name is:

```text
vision_local
```

These URLs are local-only defaults. They must not be used for staging or production.

The split matters during bootstrap:

- `DATABASE_URL` is the least-privilege runtime role.
- `DATABASE_ADMIN_URL` is the maintenance role used for reset and bootstrap work.
- `DATABASE_ADMIN_TARGET_DB` names the application database to drop, recreate, migrate, grant, and seed.

## Install

Install dependencies:

```powershell
corepack pnpm install
```

## Database Workflow

Generate a named migration after changing schema files:

```powershell
corepack pnpm db:generate --name=your_change_name
```

Apply migrations:

```powershell
corepack pnpm db:migrate
```

With `DATABASE_ADMIN_URL` and `DATABASE_ADMIN_TARGET_DB` present, migration tooling is expected to run against the admin target database path instead of the least-privilege runtime connection.

Seed the local database:

```powershell
corepack pnpm db:seed
```

In local development, `db:seed` should run through the admin target database path when the admin env vars are present, because the runtime role does not have broad bootstrap privileges.

Reset the local database and replay migrations and seeds:

```powershell
corepack pnpm db:reset
```

`db:reset` uses the admin path to drop and recreate the target database, then runs migrations, applies Phase 9 grants, and seeds through the admin target database. The runtime connection stays narrow and should not be used for destructive bootstrap work.

For Phase 9, migration and reset scripts are expected to honor the admin/runtime split:

- destructive bootstrap uses `DATABASE_ADMIN_URL` plus `DATABASE_ADMIN_TARGET_DB`
- the runtime role stays non-superuser, non-owner, and without `BYPASSRLS`
- `tenant_rls_probes` is the proof surface for row-level security

## Verification

Run typechecking:

```powershell
corepack pnpm typecheck
```

Run linting:

```powershell
corepack pnpm lint
```

Run tests:

```powershell
corepack pnpm test
```

Run all three before handing off a development change.
