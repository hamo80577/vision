# Phase 5 Auth Foundation Design

**Date:** 2026-04-21

**Goal**

Implement the minimum real identity layer required to close Phase 5 of the roadmap: database-backed sessions for customer and internal subjects, Argon2id password hashing, login/logout flows, session expiry/revocation/rotation, secure cookie handling, request auth resolution, and test proof for the critical session states.

**Scope Boundary**

This slice is backend-only. It does not include UI, role modeling, authorization policy, tenant isolation enforcement, MFA, password reset completion, or branch-selection UX. Those remain in later phases even if a few fields are carried in the schema now for forward compatibility.

## Why This Slice Exists

The roadmap requires real identity handling before role behavior or tenant operations. The system currently has request-context and observability foundations, but no actual authentication state, no loginable subjects, no revocable sessions, and no auth middleware. This design closes that gap without smuggling in later-phase concerns.

## Architecture

Authentication logic will be split across three layers:

1. `packages/db` defines the schema and migration for auth subjects, sessions, and minimal account events.
2. `packages/authn` implements password hashing, token generation, session issuance, session lookup, revocation, rotation, and login/logout orchestration against the database.
3. `apps/api` exposes the HTTP contract, cookie issuance/clearing, and request middleware that resolves an authenticated subject from a session cookie.

This keeps HTTP concerns out of the reusable identity core while avoiding unnecessary abstraction. Authorization remains out of scope and will not be coupled into this package.

## Subject Model

Phase 5 supports exactly two subject types:

- `customer`
- `internal`

Each loginable identity is represented by an auth subject record. This record is the authentication source of truth, not a UI form model and not an authorization role model.

Each subject record stores:

- stable `id`
- `subject_type`
- `login_identifier`
- normalized lookup value
- `password_hash`
- `password_updated_at`
- `is_enabled`
- audit timestamps

The auth subject model intentionally does not try to encode roles, permissions, branch memberships, or tenant grants. Those belong to later domains.

## Session Model

Sessions are database-backed and revocable. A session consists of:

- a public session identifier
- a secret token presented only by the client cookie
- a hash of that secret stored in the database
- subject linkage
- assurance level
- optional active tenant and branch context fields
- issue, expiry, rotation, and revocation timestamps
- revocation reason

The cookie will carry an opaque token composed from the session identifier and raw secret. The raw secret is never stored. Session validation requires matching the database row and verifying the presented secret against the stored hash.

This model supports:

- logout by revocation
- forced invalidation
- expiry checks
- rotation after sensitive changes
- future extension to tenant-aware context and assurance upgrades

## Database Design

The Phase 5 migration adds three tables:

### `auth_subjects`

Stores loginable identities for both `customer` and `internal` subjects.

Key constraints:

- normalized login lookup must be indexed
- subject type is constrained to the allowed enum values
- password hash is mandatory for password-based login
- disabled subjects must not authenticate

### `auth_sessions`

Stores revocable, expiring, rotatable sessions.

Required columns:

- `id`
- `subject_id`
- `subject_type`
- `secret_hash`
- `assurance_level`
- `active_tenant_id`
- `active_branch_id`
- `issued_at`
- `expires_at`
- `last_rotated_at`
- `revoked_at`
- `revocation_reason`
- `created_at`
- `updated_at`

Required behavior:

- active sessions must have `revoked_at IS NULL`
- expired sessions must fail authentication
- revoked sessions must fail authentication
- rotated sessions must invalidate the previous cookie token

### `auth_account_events`

Stores minimal audit events for authentication activity.

Phase 5 event types:

- `login_success`
- `login_failure`
- `logout`
- `session_revoked`
- `session_rotated`

This is intentionally small. It gives the system an authentication audit trail now without trying to solve the full audit domain in this phase.

## Password Handling

Passwords use Argon2id. The implementation must:

- hash with Argon2id before storage
- verify through Argon2id on login
- reject invalid credentials without exposing whether the subject exists
- avoid storing plaintext tokens or passwords

The system does not implement the full password reset flow in this slice. It only leaves room for a later password-reset strategy.

## HTTP Contract

Phase 5 exposes four backend routes:

- `POST /auth/customer/login`
- `POST /auth/internal/login`
- `POST /auth/logout`
- `GET /auth/session`

### Login

The login endpoints accept the login identifier and password for the relevant subject type. On success they:

- verify the subject is enabled
- verify the password
- create a session row
- write a secure auth cookie
- emit a `login_success` event
- return the authenticated session summary

On failure they:

- emit a `login_failure` event when appropriate
- return an authentication error without leaking account existence

### Logout

Logout requires a current authenticated session. It:

- revokes the active session
- clears the auth cookie
- emits a `logout` event

If the caller presents a revoked or expired session, the request fails closed and the cookie is cleared.

### Session Introspection

`GET /auth/session` resolves the current cookie-backed session. It returns the authenticated subject summary for a valid active session and fails for missing, expired, revoked, or invalid sessions.

## Cookie Model

The auth cookie is:

- `HttpOnly`
- `SameSite=Lax`
- path-scoped to `/`
- `Secure` when the runtime environment is not local development

JavaScript-readable auth cookies are forbidden. Cookie creation and clearing happen only in the API layer so the auth core stays transport-agnostic.

## Middleware and Request Resolution

The API adds auth middleware that:

- reads the auth cookie
- resolves the session through `packages/authn`
- rejects expired or revoked sessions
- attaches the authenticated subject and session summary to the Fastify request when valid

This middleware provides real request identity without introducing authorization decisions. Any route-level permission logic remains out of scope.

## Rotation Behavior

Phase 5 includes session rotation support in the auth service layer. Rotation will:

- create a new session secret for the existing session record or replace the active token material
- update `last_rotated_at`
- invalidate the previous cookie token

The initial API surface does not need a public rotation endpoint. Rotation is still implemented now so the identity layer satisfies the roadmap requirement and can be reused by later sensitive flows.

## Error Model

Authentication errors must integrate with the existing API problem-details model. The system should distinguish:

- invalid credentials
- missing session
- expired session
- revoked session

Responses must fail closed and remain safe for public exposure.

## Test Proof Required for This Slice

This slice is not complete unless the test suite proves the following against the real auth code path:

- valid customer login succeeds and returns a usable session
- valid internal login succeeds and returns a usable session
- expired session fails
- revoked session fails
- logout revokes the session and clears the cookie
- a logged-out session cannot be reused
- rotated session tokens invalidate the previous token
- wrong password fails login

The tests should run against the database-backed implementation, not an in-memory fake that bypasses the real session model.

## Out of Scope

The following are explicitly deferred:

- roles and permission checks
- tenant authorization rules
- MFA enrollment and verification
- password reset completion flow
- customer registration UI
- ERP or website login screens
- support access
- branch switching flows

## Definition of Done for This Slice

This Phase 5 slice is done when:

- the database schema and migration for auth subjects, sessions, and auth account events exist
- password hashing uses Argon2id
- customer and internal login work through the API
- sessions are database-backed, expiring, revocable, and rotatable
- secure cookies are issued and cleared correctly
- request auth middleware resolves the active session
- the required auth tests pass

Phase 5 as a whole is not automatically closed just because this slice passes. Closure still depends on whether the implemented outputs fully satisfy the roadmap exit criteria and whether no required Phase 5 item remains missing after verification.
