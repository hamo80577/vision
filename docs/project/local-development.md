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

## PostgreSQL

Start the local database:

```powershell
docker compose up -d postgres
```

Check that PostgreSQL is healthy:

```powershell
docker compose exec -T postgres pg_isready -U vision_local -d vision_local
```

Stop the local database:

```powershell
docker compose down
```

The local runtime database URL is:

```text
postgresql://vision_local:vision_local_password@localhost:5432/vision_local
```

The local admin database URL is:

```text
postgresql://vision_local:vision_local_password@localhost:5432/postgres
```

These URLs are local-only defaults. They must not be used for staging or production.

## Install

Install dependencies:

```powershell
corepack pnpm install
```

## Database Workflow

Generate a named migration after changing schema files:

```powershell
corepack pnpm db:generate -- --name=your_change_name
```

Apply migrations:

```powershell
corepack pnpm db:migrate
```

Seed the local database:

```powershell
corepack pnpm db:seed
```

Reset the local database and replay migrations and seeds:

```powershell
corepack pnpm db:reset
```

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
