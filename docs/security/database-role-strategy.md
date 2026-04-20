# Database Role Strategy

Vision distinguishes between runtime database access and admin database access.

## Runtime Access

- `DATABASE_URL` is for application runtime access.
- `DATABASE_URL` is also the connection Drizzle migrations use against the application database.
- Runtime code must not assume superuser or schema-owner privileges.
- Later phases will harden runtime privileges further.

## Admin Access

- `DATABASE_ADMIN_URL` is for maintenance and admin-only operations, especially reset drop/create against the `postgres` maintenance database.
- `DATABASE_ADMIN_TARGET_DB` identifies the application database name that admin tooling should drop and recreate.
- In local development it may use the same PostgreSQL role as runtime for practicality.
- In every environment `DATABASE_ADMIN_URL` must target the `postgres` maintenance database, not the application database itself.

## Boundary

This split exists now so later phases can tighten privileges without reworking every script and config path.
