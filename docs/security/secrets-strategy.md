# Secrets Strategy

Vision keeps real secrets out of Git.

## Repository Rules

- Commit `.env.example` so developers can see required variables.
- Do not commit `.env`, `.env.local`, `.env.production`, or other real environment files.
- Do not commit production database URLs, API keys, service tokens, or passwords.

## Local Defaults

The local PostgreSQL defaults are:

```text
database: vision_local
user: vision_local
password: vision_local_password
```

These values are allowed for local development and test fixtures only.

## Staging And Production

Staging and production secrets must come from environment-specific secret stores, such as deployment platform environment variables or managed secret services.

Runtime configuration must reject known local defaults when `APP_ENV` is `staging` or `production`.

## Frontend Runtime Values

Frontend apps may only read public runtime values such as `NEXT_PUBLIC_API_BASE_URL`.

Server-only values such as `DATABASE_URL` must stay out of frontend configuration contracts.
