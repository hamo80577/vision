# Cookie Session Protection

Vision uses database-backed session cookies for customer and internal browser flows. Any authenticated mutation that relies on that cookie must satisfy two server-side requirements before execution:

1. strict request validation with explicit allowlisted fields
2. centralized CSRF verification

## CSRF Model

Cookie-authenticated mutation routes set `config.csrfProtected = true` and are enforced by a shared Fastify hook in `apps/api/src/csrf-protection.ts`.

When a session cookie is issued, the server also issues a readable companion cookie:

- session cookie: `vision_auth_session` (`HttpOnly`)
- CSRF cookie: `vision_auth_csrf` (readable by the first-party client)

The client must echo the CSRF cookie value into the `x-vision-csrf-token` header on authenticated mutations. Requests with a resolved authenticated session fail closed with `403 csrf_token_invalid` when the cookie/header pair is missing or mismatched.

This keeps CSRF enforcement centralized instead of duplicating checks in each route handler.

## Auth Mutation Contract

Auth mutation routes no longer rely on implicit body parsing. Each POST route now defines an explicit request schema, and mutation bodies reject unknown fields through `additionalProperties: false` or an explicit empty-body schema.

The protected routes currently covered by the centralized CSRF hook are:

- `/auth/internal/assurance/step-up/start`
- `/auth/internal/assurance/step-up/verify`
- `/auth/internal/mfa/backup-codes/regenerate`
- `/auth/internal/context/branch/switch`
- `/auth/logout`

## Branch-Switch Safety

Branch switching still depends on tenancy and authorization guards at the route boundary, but the auth service now also requires the caller to provide the allowed branch list and rejects targets outside that allowlist before any session mutation is persisted.
