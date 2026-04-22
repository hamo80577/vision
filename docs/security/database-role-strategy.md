# Database Role Strategy

Vision distinguishes between runtime database access and admin/bootstrap database access.

## Runtime Access

- `DATABASE_URL` is the application runtime connection string.
- The runtime role is derived from `DATABASE_URL` and hardened to be non-superuser, with no `BYPASSRLS`, no database ownership, and least-privilege grants only.
- Runtime code must never assume admin, schema-owner, or maintenance-database privileges.
- Phase 9 runtime grants stay narrow and are intentionally separate from bootstrap privileges.

## Admin Access

- `DATABASE_ADMIN_URL` is for maintenance and bootstrap operations, including reset, migration replay, grant application, and seeding.
- `DATABASE_ADMIN_TARGET_DB` identifies the application database name that admin tooling should drop and recreate.
- `DATABASE_ADMIN_URL` must target the `postgres` maintenance database, not the application database itself.
- The admin role is separate from the runtime role and is only used for administrative paths.

## Boundary

The split exists so bootstrap and reset tooling can stay powerful while the runtime connection stays least privilege and RLS-safe.

## Local Defaults

Local development uses distinct roles on the same PostgreSQL instance:

- `DATABASE_URL=postgresql://vision_runtime:vision_runtime_password@localhost:5433/vision_local`
- `DATABASE_ADMIN_URL=postgresql://vision_admin:vision_admin_password@localhost:5433/postgres`
- `DATABASE_ADMIN_TARGET_DB=vision_local`

The runtime and admin roles are intentionally different, even though both are local-only defaults.
