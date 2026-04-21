# Phase 6 MFA and Assurance Design

**Date:** 2026-04-21

**Goal**

Implement the Phase 6 security controls required for sensitive internal roles: MFA enrollment, MFA verification, hashed backup codes, auditable assurance challenges, ordered assurance levels, and server-side assurance guards that fail closed.

**Scope Boundary**

This slice extends the Phase 5 authentication foundation. It does not implement the Phase 7 authorization engine, full tenant or branch role modeling, support-access policy workflows, ERP or platform UI polish, or the broader internal user-management domain. The Phase 6 sensitivity marker exists only to target MFA policy and preserve clear migration into Phase 7.

## Why This Slice Exists

The roadmap and blueprint require real MFA and assurance enforcement for sensitive internal roles before broader authorization and tenancy work continues. Phase 5 established database-backed sessions, but it only supports `basic` assurance and has no MFA factor storage, no backup-code recovery, no assurance challenge primitive, and no server-side guard for elevated actions. Phase 6 closes that gap without prematurely importing the full permission system.

## Architecture

Phase 6 extends the existing auth stack across the same three layers established in Phase 5:

1. `packages/db` adds the schema and migrations for internal MFA sensitivity markers, MFA factors, backup codes, assurance challenges, and expanded assurance/audit enums.
2. `packages/authn` adds the core MFA and assurance logic: pending challenge creation, TOTP enrollment and verification, backup-code verification, assurance upgrades, and reusable assurance guards.
3. `apps/api` exposes the HTTP contract for sensitive internal login, MFA enrollment and verification, and future-ready step-up endpoints while preserving backend-only enforcement.

This keeps transport concerns in the API layer and assurance logic in the reusable auth package. The design remains consistent with the modular monolith boundary and does not create a separate auth service.

## Sensitive Internal Marker

Phase 6 introduces a temporary internal sensitivity marker on auth subjects:

- `none`
- `platform_admin`
- `tenant_owner`
- `branch_manager`

Rules:

- `customer` subjects keep this field `null`
- non-sensitive `internal` subjects use `none`
- the field is used only for MFA policy, audit context, and explicit Phase 7 migration clarity

This field must not become a hidden authorization system. It is only the narrowest possible bridge that lets Phase 6 target the documented sensitive roles without forcing the entire authorization model into this phase.

## Assurance Model

Phase 6 expands session assurance into an ordered model:

- `basic`
- `mfa_verified`
- `step_up_verified`

Ordering rule:

`basic < mfa_verified < step_up_verified`

The session table must add an explicit assurance timestamp named `assurance_updated_at`. This timestamp records when the current assurance level was granted or refreshed and becomes the basis for future step-up freshness checks.

## Database Design

Phase 6 extends the auth schema in five places.

### `auth_subjects`

Add the temporary Phase 6 sensitivity marker for internal identities.

Required behavior:

- customers must keep the field `null`
- internal subjects must use one of the enum values
- the field must not be used as a substitute for authorization decisions

### `auth_sessions`

Expand the assurance enum from only `basic` to:

- `basic`
- `mfa_verified`
- `step_up_verified`

Add:

- `assurance_updated_at`

Required behavior:

- newly issued non-sensitive sessions start at `basic`
- sensitive-role login must not create a real session before MFA succeeds
- successful MFA verification issues the first real session at `mfa_verified`
- successful step-up updates the same session to `step_up_verified`
- assurance transitions must update `assurance_updated_at`

### `auth_assurance_challenges`

Add a dedicated short-lived challenge table for pending MFA and in-session step-up flows.

Core fields:

- `id`
- `subject_id`
- nullable `session_id`
- `required_assurance`
- `reason`
- `secret_hash`
- `expires_at`
- `consumed_at`
- `invalidated_at`
- `completed_at`
- `created_at`
- `updated_at`

Design rules:

- `required_assurance` is a closed enum, not free text
- `reason` is a closed enum, not free text
- `session_id` is nullable so the same primitive supports both pending-login MFA and in-session step-up
- challenge secrets are never stored plaintext
- consumed, expired, or invalidated challenges must fail closed

Initial challenge reasons should support:

- `login_mfa`
- `mfa_enrollment`
- `tenant_context_switch`
- `support_grant_activation`
- `website_management_write`
- `data_export`
- `credential_reset`

Phase 6 only needs to exercise a subset immediately, but the enum should be explicit now.

### `auth_mfa_totp_factors`

Add a TOTP factor table with encrypted secret storage.

Core fields:

- `id`
- `subject_id`
- `encrypted_secret`
- `encryption_key_version`
- `enrolled_at`
- `verified_at`
- `disabled_at`
- `last_used_at`
- `created_at`
- `updated_at`

Required behavior:

- TOTP secrets must be encrypted at rest
- only one active factor may exist per subject
- the one-active-factor rule must be enforced with a partial unique constraint on active rows
- an unverified factor must not count as enrolled MFA

### `auth_mfa_backup_codes`

Add one row per backup code.

Core fields:

- `id`
- `subject_id`
- `batch_id`
- `code_hash`
- `created_at`
- `used_at`

Required behavior:

- backup codes must be hashed at rest
- raw backup codes are shown only at generation time
- used codes cannot be reused
- regenerating codes invalidates prior active codes and writes an audit event

### `auth_account_events`

Expand durable auth events so Phase 6 is auditable.

Add at minimum:

- `mfa_enrollment_started`
- `mfa_enrollment_completed`
- `mfa_challenge_created`
- `mfa_challenge_failed`
- `mfa_verified`
- `backup_code_used`
- `backup_codes_regenerated`
- `step_up_started`
- `step_up_verified`
- `assurance_denied`

This table remains an auth-focused audit stream, not the entire audit subsystem for the platform.

## Secrets and Recovery Material

Phase 6 must preserve two distinct protection rules:

- TOTP secrets are encrypted at rest
- backup codes are hashed at rest

Neither raw TOTP secrets, provisioning payload secrets, backup codes, nor reusable challenge tokens may appear in structured logs, auth account event detail strings, or error payloads.

The encryption key contract can remain minimal in this phase, but the schema must carry `encryption_key_version` so key rotation can be added without redesign.

## Auth Flow

### Customer Login

`POST /auth/customer/login` remains unchanged in Phase 6. Customers still receive a normal `basic` session because Phase 6 targets sensitive internal roles only.

### Internal Login

`POST /auth/internal/login` continues to verify identifier, password, and enabled-state exactly as in Phase 5, then branches by sensitivity:

- if the subject sensitivity is `none`, issue a normal `basic` session and set the auth cookie
- if the sensitivity is `platform_admin`, `tenant_owner`, or `branch_manager`, do not issue a real session yet

Sensitive internal users therefore never receive a usable password-only auth cookie.

### Pending MFA Challenge

For a sensitive internal subject, successful password verification creates an assurance challenge with:

- `required_assurance = mfa_verified`
- `reason = login_mfa` or `mfa_enrollment`
- short expiry
- hashed challenge secret

The API returns `202` with a `challengeToken` and next-step state, but no auth cookie.

### Enrollment Required Flow

If the subject has no active verified TOTP factor, the login response must indicate `mfa_enrollment_required`.

`POST /auth/internal/mfa/enrollment/start`:

- accepts the pending `challengeToken`
- validates the challenge
- generates a TOTP secret
- stores the secret encrypted at rest
- returns the one-time provisioning payload needed for the authenticator app
- writes `mfa_enrollment_started`

`POST /auth/internal/mfa/enrollment/verify`:

- accepts the `challengeToken` and TOTP code
- verifies the code against the pending factor
- marks the factor verified
- generates a batch of backup codes
- stores only backup-code hashes
- writes `mfa_enrollment_completed`
- creates the first real auth session at `mfa_verified`
- sets the auth cookie
- consumes the challenge

### Existing MFA Flow

If the subject already has an active verified TOTP factor:

`POST /auth/internal/mfa/verify`:

- accepts the `challengeToken`
- accepts either a TOTP code or a backup code
- verifies the factor or unused backup code
- marks used backup codes as consumed
- writes `mfa_verified` and `backup_code_used` where relevant
- creates the real auth session at `mfa_verified`
- sets the auth cookie
- consumes the challenge

`POST /auth/internal/mfa/backup-codes/regenerate`:

- requires a valid authenticated session
- requires `step_up_verified`
- generates a new batch of backup codes
- invalidates previously active unused codes
- stores only the new hashes
- writes `backup_codes_regenerated`

### Failure Behavior

Incorrect codes, replayed challenges, expired challenges, invalidated challenges, and otherwise invalid MFA submissions must:

- return no session
- return no auth cookie
- write `mfa_challenge_failed`
- fail closed

## Step-Up Flow

Phase 6 also introduces a reusable in-session step-up primitive built on the same challenge table.

`POST /auth/internal/assurance/step-up/start`:

- requires a valid authenticated session
- creates a new assurance challenge tied to that session
- uses a closed `reason` enum such as `support_grant_activation`, `tenant_context_switch`, `website_management_write`, `data_export`, or `credential_reset`
- writes `step_up_started`

`POST /auth/internal/assurance/step-up/verify`:

- accepts the current session plus challenge token
- verifies TOTP or backup code
- upgrades the existing session to `step_up_verified`
- updates `assurance_updated_at`
- consumes the challenge
- writes `step_up_verified`

Support-related step-up in this phase protects grant activation, not the broader support-grant policy model.

## Assurance Guard

Phase 6 must add one reusable server-side guard in the auth layer:

`requireAssurance(auth, requiredAssurance, options?)`

Required behavior:

- accepts only closed assurance enum values
- compares the current session against the ordered assurance model
- supports freshness checks through `options.maxAgeMs` using `assurance_updated_at`
- can accept a safe closed denial reason enum for structured failure handling

Response rules:

- `401` when no valid authenticated session exists
- `403` with `insufficient_assurance` when the session exists but is below the required level or too old for freshness rules

The guard is the enforcement point. Frontend behavior may react to the response, but the browser is never trusted to enforce assurance.

The guard must be reusable and composable so Phase 7 can layer authorization on top instead of replacing the assurance model.

## API Contract

Phase 6 adds or changes the following backend auth endpoints:

- `POST /auth/internal/login`
- `POST /auth/internal/mfa/enrollment/start`
- `POST /auth/internal/mfa/enrollment/verify`
- `POST /auth/internal/mfa/verify`
- `POST /auth/internal/mfa/backup-codes/regenerate`
- `POST /auth/internal/assurance/step-up/start`
- `POST /auth/internal/assurance/step-up/verify`

Backup-code regeneration must use the assurance guard instead of custom route-local checks.

## Enforcement Boundary

The Phase 6 sensitivity marker controls whether login requires MFA. It must not spread into generalized `if role === ...` permission checks.

The Phase 6 assurance guard controls whether a session has enough authentication strength for a sensitive action. It does not decide whether the actor is allowed to perform the action at all.

This distinction is critical:

- Phase 6 owns authentication strength
- Phase 7 owns authorization decisions

## Observability and Audit

Every meaningful MFA and assurance transition must produce durable auth audit records and safe structured observability context.

At minimum emit events for:

- challenge creation
- challenge failure
- enrollment start
- enrollment completion
- MFA verification
- backup-code use
- backup-code regeneration
- assurance denial
- step-up start
- step-up completion

Observability must never include:

- plaintext TOTP secrets
- raw backup codes
- reusable challenge secrets
- anything that would let an operator replay MFA material

## Test Proof Required for This Slice

Phase 6 is not complete unless tests prove all of the following against the real auth path:

- sensitive internal login returns a pending challenge instead of a session
- non-sensitive internal login still receives a `basic` session
- no auth cookie is issued before MFA succeeds
- TOTP enrollment start creates the encrypted factor state correctly
- TOTP enrollment verify creates the first `mfa_verified` session
- sensitive login with existing MFA succeeds through TOTP verification
- backup codes are generated once, stored hashed, and can be used exactly once
- backup-code regeneration invalidates the prior batch and writes an audit event
- expired, consumed, or invalidated challenges fail closed
- the API returns `401` for missing or invalid sessions
- the API returns `403 insufficient_assurance` for authenticated-but-under-assured requests
- step-up start and verify upgrade a session to `step_up_verified`
- step-up freshness checks fail when the assurance age is too old
- only one active TOTP factor may exist per subject
- assurance-denial and MFA audit events are written

Tests should include unit coverage for pure auth logic and integration coverage across API, cookie handling, and database persistence.

## Out of Scope

The following are explicitly deferred:

- the Phase 7 authorization engine
- the final tenant and branch role model
- the broader support-access subsystem
- support request, approval, and grant policy logic
- ERP login screens and polished MFA UI
- platform admin UI workflows beyond minimal API exercisability
- multi-branch context switching implementation
- tenant-aware authorization decisions

## Documentation Requirement

Because Phase 6 changes the auth model materially, implementation must update the living documentation for auth assumptions and record clearly that `internal_sensitivity` is a temporary Phase 6 bridge to be replaced deliberately by the Phase 7 authorization model.

## Definition of Done for This Slice

This Phase 6 slice is done when:

- the database schema and migrations support MFA factors, backup codes, assurance challenges, expanded assurance levels, and the temporary internal sensitivity marker
- sensitive internal login requires MFA before a real session is issued
- TOTP enrollment and verification work through the API
- backup codes are generated, hashed, auditable, and single-use
- step-up challenges can upgrade an authenticated session to `step_up_verified`
- a reusable assurance guard enforces ordered assurance levels and freshness server-side
- auth audit events and safe observability signals exist for MFA and assurance transitions
- the required security regression tests pass

Phase 6 as a whole is not automatically closed just because this slice passes. Closure still depends on whether the implemented outputs fully satisfy the roadmap exit criteria and whether no required Phase 6 item remains missing after verification.
