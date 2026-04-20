# Vision Greenfield Blueprint

## Complete Technical Reference for Building Vision Cleanly From Day One

Version: 1.0  
Audience: Founder / technical decision-maker / AI-assisted builder / implementation lead  
Project type: Multi-tenant SaaS for booking, tenant ERP operations, and platform administration

---

## 1) Why this document exists

This document is the complete reference for how Vision should be built **from scratch on a clean foundation**.

It is intentionally opinionated.
It does not try to list every possible option.
It defines:

- what should be used
- what should not be used
- how the project should be structured
- how security should work
- how tenancy should work
- how the database should be designed
- how the applications should be split
- how testing, observability, jobs, and deployment should be handled
- what anti-patterns must be avoided even if they look convenient in the short term

This is not a quick summary.
It is the operating manual for building Vision properly.

---

## 2) What Vision actually is

Vision is not just a website.
It is not just a booking flow.
It is not just an ERP.
It is a **multi-surface multi-tenant SaaS platform** with three main product faces:

1. **Public booking website** for end customers
2. **Tenant internal ERP** for each tenant and branch team
3. **Platform admin console** for platform-level operations, oversight, security review, and controlled support access

This means the architecture must support all of the following together:

- multi-tenant isolation
- public and internal traffic separation
- customer authentication
- internal staff authentication
- tenant and branch scoping
- centralized authorization
- strict auditability
- secure internal access
- scalability without turning the codebase into a mess

Because of that, the project must be designed as a real SaaS platform from day one, not as a single-page app that later gets patched into one.

---

## 3) Core architectural decision

### Build Vision as a modular monolith

This is the correct choice.

Do **not** start with microservices.

A modular monolith means:

- one backend service
- one worker service
- separate frontend apps where useful
- one PostgreSQL database
- strict internal module boundaries
- clean domain separation inside the monorepo

### Why this is the right choice

Because Vision needs:

- strong consistency
- transactional workflows
- central security logic
- manageable complexity
- fast iteration
- low infrastructure overhead

Microservices at this stage would only add:

- distributed complexity
- auth inconsistency risk
- harder debugging
- harder local development
- slower delivery

### Non-negotiable rule

**Do not split the system into microservices until there is a proven operational reason.**

Premature service splitting is one of the fastest ways to destroy development speed and security consistency.

---

## 4) Recommended technology stack

This is the recommended greenfield stack.

### Frontend

Use **Next.js with TypeScript**.

Build three separate apps:

- `apps/web` for the public booking and customer area
- `apps/erp` for the tenant ERP
- `apps/platform` for the platform admin console

### Why Next.js

Because Vision needs:

- SSR and SEO for the public site
- authenticated dashboard-style interfaces
- layouts
- forms
- route-based app structure
- server-driven pages
- modern TypeScript support
- clean component architecture

Next.js gives the best balance between speed, structure, SSR capability, and ecosystem maturity.

### Backend API

Use **Fastify with TypeScript**.

### Why Fastify

Because it is:

- fast
- lightweight
- highly controllable
- better suited than heavy backend frameworks for this project style
- good for hooks, request context, auth, observability, and structured architecture

It gives the structure you need without burying the code under unnecessary abstraction.

### Database

Use **PostgreSQL**.

### Why PostgreSQL

Because Vision needs:

- strong transactional integrity
- multi-tenant enforcement
- advanced constraints
- partial indexes
- exclusion constraints
- flexible SQL
- row-level security

PostgreSQL is the correct database for this system.

### DB access layer

Use **Drizzle ORM plus explicit SQL where needed**.

### Why this combination

You want:

- typed schema support
- manageable migrations
- query ergonomics
- but still full visibility into the SQL

Do not let an ORM become the real architect of the system.
The real architecture must remain visible and under your control.

### Validation

Use **Zod**.

### Why Zod

Because you need:

- typed validation
- strict request parsing
- shared DTO validation when appropriate
- reliable form and API input validation

### Monorepo toolchain

Use:

- **pnpm** for workspaces
- **Turborepo** for task orchestration and caching

### Testing

Use:

- **Vitest** for unit and service-level tests
- **Playwright** for end-to-end testing

### CI/CD

Use **GitHub Actions**.

### Observability

Use:

- **OpenTelemetry** for traces and metrics instrumentation
- structured JSON logs
- request IDs and correlation IDs

---

## 5) Things that must not be the foundation

Do **not** use the following as your starting architecture:

- microservices
- a single frontend app that mixes public, ERP, and platform admin in one routing layer
- browser-side authorization as a primary decision layer
- permanent unrestricted internal access
- SQLite for the main production database
- MongoDB for this project type
- Prisma as the hidden owner of architecture decisions
- local role checks scattered across random files as the real authorization model
- UI-only controls that pretend to enforce permissions
- "we will fix security later"
- one codebase with no clean module boundaries
- direct DB access from route handlers
- routes that trust URL tenant values without backend enforcement
- long-term dependence on raw, untyped request bodies

These are not stylistic preferences.
They are common failure patterns.

---

## 6) Required monorepo structure

Use this structure.

```text
vision/
  apps/
    web/
    erp/
    platform/
    api/
    worker/
  packages/
    ui/
    design-system/
    config/
    db/
    validation/
    authn/
    authz/
    tenancy/
    observability/
    contracts/
    test-utils/
  db/
    migrations/
    seeds/
  docs/
    architecture/
    security/
    adr/
  .github/
    workflows/
  package.json
  pnpm-workspace.yaml
  turbo.json
```

### Meaning of each app

#### `apps/web`
Public booking website and customer account area.

#### `apps/erp`
Tenant internal ERP.

#### `apps/platform`
Platform admin application only.

#### `apps/api`
Backend HTTP API.
No frontend logic should live here.

#### `apps/worker`
Asynchronous jobs and background processing.

### Meaning of each package

#### `packages/ui`
Reusable shared UI components.

#### `packages/design-system`
Design tokens, layout primitives, style rules, and visual conventions.

#### `packages/config`
Environment parsing and typed runtime configuration.

#### `packages/db`
Database client, schema definitions, helpers, SQL utilities, and transaction helpers.

#### `packages/validation`
Zod schemas and input validation primitives.

#### `packages/authn`
Authentication primitives such as sessions, passwords, MFA helpers, token handling, cookies, and CSRF helpers.

#### `packages/authz`
The internal centralized authorization engine.
This must become the single source of truth for authorization decisions.

#### `packages/tenancy`
Tenant resolution, tenant context, tenant-aware routing helpers, and tenancy-related utilities.

#### `packages/observability`
Logging, tracing, metrics, instrumentation helpers, and request correlation tools.

#### `packages/contracts`
Shared contracts and DTO-level types where sharing is actually useful.

#### `packages/test-utils`
Shared test fixtures, fake contexts, seed helpers, and common testing utilities.

---

## 7) Frontend application split rules

### Public web app (`apps/web`)
This app owns:

- public tenant landing pages
- customer login and registration
- booking flow
- booking confirmation
- customer dashboard
- customer account settings

### ERP app (`apps/erp`)
This app owns:

- internal tenant operations
- appointments management
- customer lookup
- employee visibility
- tenant website settings
- branch content management
- offers and website operations
- internal operational screens

### Platform app (`apps/platform`)
This app owns:

- platform tenant directory
- platform-level oversight
- security review tools
- support/JIT internal access workflows
- audit review
- privilege review

### Hard rule

Do **not** merge platform admin into ERP.

Even if it feels easier in the short term, it is the wrong boundary.
Platform admin is a separate trust surface and should be treated that way.

---

## 8) Backend domain structure

Inside `apps/api`, organize around business domains.

Example:

```text
apps/api/src/modules/
  auth/
  tenants/
  branches/
  services/
  customers/
  employees/
  booking/
  appointments/
  website/
  billing/
  notifications/
  platform-access/
  support-access/
  audit/
```

Each module should follow a consistent structure.

```text
module-name/
  domain/
    entities.ts
    policies.ts
    rules.ts
  application/
    service.ts
    use-cases.ts
  infrastructure/
    repository.ts
    queries.sql.ts
  contracts/
    dto.ts
```

### Meaning of each layer

#### `domain`
Business rules.
Pure logic.
No transport concerns.
No HTTP.
Minimal or no DB code.

#### `application`
Use cases and orchestration.
The place where business operations are coordinated.

#### `infrastructure`
Persistence and external adapters.
Repositories, SQL queries, storage adapters, integrations.

#### `contracts`
Request and response contracts and DTOs used by the module.

---

## 9) Route handling rules

### Correct flow

Every route must follow this flow:

1. request parsing
2. DTO validation
3. authentication
4. authorization
5. application service
6. repository/data access
7. response mapping

### Forbidden pattern

Do not do this:

- route reads body
- route directly runs SQL
- route directly checks role strings
- route directly returns DB row as response

That is not a scalable or secure architecture.

### Hard rule

**Routes are not business logic containers.**

Routes are transport adapters.
Nothing more.

---

## 10) Multi-tenant architecture principles

This is one of the most important parts of Vision.

### Tenant identity rules

- `tenantSlug` from the URL is **intent**, not trust
- the backend must resolve real tenant identity
- sessions must carry or derive tenant context properly
- authorization must evaluate tenant context server-side
- database access must enforce tenant boundaries

### Required tenancy model

Every tenant-scoped business table must include:

- `tenant_id`

Every branch-scoped table should also include:

- `branch_id`

### Categories of data

#### Global/system tables
Examples:

- tenants
- platform-level internal users if designed globally
- schema_migrations
- global support request metadata if truly cross-tenant

These must be few.

#### Tenant-scoped business tables
Examples:

- branches
- services
- employees
- customers
- bookings
- appointments
- offers
- website content
- notification logs
- invoice drafts

These must be isolated strictly.

### Core rule

**Tenant isolation is not optional and must not rely only on application code discipline.**

You must enforce it in both:

- authorization logic
- database layer

---

## 11) Centralized authorization model

Vision must use an **internal centralized authorization engine**.

Do not depend on scattered role checks.
Do not depend on UI visibility as permission enforcement.
Do not depend on ad hoc `if user.role === ...` logic across the codebase.

### What the authorization engine should provide

It should expose a stable contract such as:

- `authorize(subject, action, resource, context)`
- `deriveAuthorizationScope(subject, resourceType, action)`
- `requireAuthorization(decision)`

### What the engine should know

It should reason about:

- actor type
- scope
- role code
- tenant assignment
- branch assignment
- employee self-relation
- customer self-relation
- support grant if any
- session assurance level
- resource type
- resource ownership or linkage
- action being attempted

### Examples of supported actions

- read
- list
- create
- update
- delete
- change_status
- manage_website
- switch_context
- request_support_access
- approve_support_access
- revoke_support_access
- export

### Authorization design rules

- deny by default
- every resource/action must be covered explicitly
- unknown resource/action pairs must deny
- support access must never be implicit
- platform privilege must not equal unrestricted tenant write access by default
- branch managers must not magically become tenant-wide actors
- customer self-access must be explicit and narrow

### Recommended mental model

This should be a **Zanzibar-inspired internal engine**, not an external dependency.

Meaning:

- relationships matter
- resource hierarchy matters
- explicit policy evaluation matters
- but the entire implementation remains inside this repo

---

## 12) Authentication model

Authentication must be strict from day one.

### Sessions

Use database-backed sessions.

Session records should include at minimum:

- `id`
- `subject_id`
- `subject_type`
- `active_tenant_id`
- `active_branch_id` if needed
- `assurance_level`
- `issued_at`
- `expires_at`
- `last_rotated_at`
- `revoked_at`
- `revocation_reason`

### Subject types

At minimum support:

- customer
- internal

### Session rules

- sessions must be revocable
- sessions must expire
- sessions must be rotatable after sensitive changes
- sessions must support assurance levels
- sessions must support audit events

### Cookies

For cookie-based web flows:

- `HttpOnly`
- `Secure`
- `SameSite` chosen intentionally
- scoped path where useful
- no JavaScript-readable auth cookies

### CSRF

Any cookie-authenticated form/action flow must enforce CSRF.

Do not skip this because the UI is "internal".
Internal does not mean safe.

### Password policy

Use:

- Argon2id
- minimum password policy
- current-password confirmation for sensitive changes
- no plaintext tokens in storage
- no weak reset flow

### Account events

Track:

- login success
- login failure
- logout
- password change
- forced re-authentication
- MFA events

---

## 13) MFA and session assurance

Vision needs strong internal authentication controls.

### Internal MFA

At minimum require MFA for:

- platform admins
- tenant owners
- branch managers

### Supported factors

At minimum:

- TOTP
- one-time backup codes

### Assurance levels

Support a model like:

- `basic`
- `mfa_verified`
- `step_up_verified`

### When step-up should be required

Examples:

- switching into sensitive tenant context as platform admin
- support grant activation for elevated access
- website-management writes
- support approval and revocation
- data exports
- credential resets

### Required rules

- MFA enrollment must be auditable
- backup code rotation must be auditable
- backup codes must be hashed at rest
- TOTP secrets must be encrypted at rest
- sensitive operations must fail closed without required assurance

---

## 14) Support access and JIT internal access

This must be designed intentionally.

### What must never exist

Do not create a permanent hidden superadmin mode that can read or write any tenant at any time without explicit control.

That is a security and compliance disaster.

### What should exist instead

A support access subsystem with:

- support access requests
- approval records
- grants
- revocation
- expiration
- audit entries

### Required properties

Every support grant must be:

- explicit
- time-bounded
- tenant-scoped
- mode-scoped
- auditable
- revocable

### Access modes

At minimum:

- `read_only`
- `elevated_write`

### Default

Support access should default to **read-only**.

### Hard rule

**Support access is not a role. It is a grant.**

---

## 15) Database security model

### PostgreSQL is not just storage here

It is also part of your security boundary.

### Use Row-Level Security on critical tenant-scoped business tables

Examples:

- tenant settings
- branches
- services
- employees
- customers
- customer accounts
- appointments
- appointment history
- website data
- offers
- notification logs
- invoice drafts

### Database role model

Use:

- migration/admin role
- runtime application role

The runtime application role must:

- not be superuser
- not bypass RLS
- not own unnecessary elevated privileges

### DB access context

Every request that touches tenant data must propagate trusted DB access context.

Typical fields may include:

- current tenant id
- current subject id
- current subject type
- current role code
- current access mode
- support grant id if active

### Hard rule

**If tenant isolation exists only in the application layer, it is incomplete.**

The DB must enforce it on critical business data.

---

## 16) Database schema design rules

### Every important table needs deliberate design

Do not create tables casually.

For each table define:

- purpose
- ownership
- tenancy scope
- foreign keys
- invariants
- indexes
- lifecycle status if needed

### Use strong constraints

Use:

- foreign keys
- unique constraints
- check constraints
- partial indexes
- exclusion constraints where useful

### Examples

#### Appointments
Need:

- `tenant_id`
- `branch_id`
- `customer_id`
- `service_id`
- `employee_id`
- `status`
- `appointment_date`
- `start_at`
- `end_at`
- source and audit columns where needed

Should also enforce:

- no overlapping bookings for the same employee
- tenant consistency across linked entities

### Money rules

Store money in integer minor units.
Do not use floating point for money.

### Time rules

Store timestamps in UTC.
Display according to tenant timezone.

### Status history

Important workflows like appointment status changes must have immutable history tables.
Do not overwrite reality silently.

---

## 17) API design rules

### Separate public and internal APIs logically

Not every route must be in a separate service, but trust surfaces must be explicit.

### Public API
For customer-facing flows.

### Internal API
For ERP and platform-facing flows.

### DTO rules

Every write operation must use explicit DTO validation.

No write route should accept unknown fields silently.

### Mass assignment rule

**Reject unexpected fields for sensitive writes.**

Do not let clients set fields like:

- role code
- employee id when auto-assignment should happen
- tenant id
- status fields unless the specific route is meant for status changes
- approval flags
- audit fields

### Error handling

Use a consistent error model.

Examples:

- `401` for unauthenticated
- `403` for authenticated but forbidden
- `404` when revealing existence would be unsafe or unnecessary
- `409` for invalid state transitions or conflicts
- `422` for business validation
- `429` for abuse protection

### Response model rule

Do not pass raw DB rows straight to clients.
Responses should be shaped intentionally.

---

## 18) Frontend architecture rules

### Default to server-driven logic

Do not push critical rules into the browser.

### Use client components only where needed

Client-side state is fine for UI interactivity.
It is not fine as the source of truth for security or tenancy.

### Component rules

- shared design system components in `packages/ui`
- app-specific page logic inside each app
- no business logic hidden inside generic UI components
- no hardcoded permission assumptions in components

### Tenant routing rules

Public app should be tenant-aware cleanly.
Examples:

- custom domain support later if needed
- slug-based routing initially

But remember:
URL is user intent.
Backend is the trust boundary.

---

## 19) Background jobs and worker model

Use a dedicated worker app.

### Worker responsibilities

Examples:

- notifications
- email dispatch
- report generation
- support grant expiry handling
- audit compaction or archival jobs if ever needed
- outbox processing

### Pattern to use

Use the **outbox pattern**.

Meaning:

- transactional business write happens first
- event/outbox row is created in the same transaction
- worker consumes and executes side effects

### Why this matters

Because it reduces inconsistent states between:

- booking created
- invoice draft created
- notification intended
- calendar side effects intended

### Job rules

- retries must be explicit
- jobs must be idempotent
- failures must be visible
- poison jobs must not loop forever
- dead-letter strategy or failure quarantine must exist

---

## 20) Testing strategy

Testing is not optional.
It is architecture enforcement.

### Unit tests
Use for:

- status transition rules
- password and MFA helpers
- authorization decisions
- support grant logic
- pricing logic
- booking eligibility rules

### Service tests
Use for:

- application services
- use cases
- repo orchestration
- auditing side effects

### Integration tests
Use for:

- API route behavior
- session resolution
- RLS-backed tenant isolation
- protected route denial
- support grant lifecycle
- auth abuse protections

### End-to-end tests
Use Playwright for:

- customer booking journey
- customer account management
- tenant owner operational flows
- branch manager scoped access
- platform admin support request flows
- security challenge flows where practical

### Security regression tests
Must exist for:

- cross-tenant read denial
- cross-tenant write denial
- missing session denial
- expired session denial
- revoked session denial
- missing support grant denial
- expired support grant denial
- read-only grant write denial
- step-up-required action denial
- DTO allowlist enforcement
- route guard fail-closed behavior

### Hard rule

If a new sensitive route is added, it must come with:

- validation coverage
- authn coverage
- authz coverage
- tests

---

## 21) CI/CD and release gate rules

### Every pull request must run

- install
- typecheck
- lint
- unit tests
- integration tests
- architecture tests
- security regression tests

### Every important merge should protect

- migration quality
- build correctness
- protected route coverage
- authz contract drift
- support access enforcement

### Security release gates should block merges when

- critical tests fail
- auth routes regress
- RLS-related tests fail
- support grant tests fail
- protected endpoints lose coverage

### Hard rule

**Security tests are not informational. They are merge gates.**

---

## 22) Observability rules

From day one, implement:

- structured JSON logging
- request IDs
- correlation IDs
- traces
- metrics
- error classification
- DB health visibility
- worker health visibility

### Things that should be observable

- request duration
- route-level error rate
- login failures
- MFA failures
- support grant activations
- support write attempts
- booking success and failure rate
- job success/failure rates
- DB pool pressure

### Logging rules

Do not log secrets.
Do not log passwords.
Do not log raw MFA secrets.
Do not dump full PII casually.

Logs must be useful, not reckless.

---

## 23) Configuration and secret management

### Environment config must be typed and validated

Do not read raw env variables everywhere in the codebase.
Use one config package.

### Secrets discipline

- no secrets in source control
- separate secrets per environment
- strong application secret
- separate encryption keys where required
- key rotation plan
- DB admin credentials must not be app runtime credentials

### Hard rule

If the app can boot with insecure default secrets in non-local environments, the configuration model is broken.

---

## 24) Deployment model

### Early-stage deployment recommendation

Use:

- Docker
- one production app deployment unit per app where needed
- reverse proxy
- PostgreSQL
- object storage
- staging environment
- production environment

### Do not start with Kubernetes

That is unnecessary complexity here.

### Required operational basics

- automated backups
- tested restore process
- migration discipline
- HTTPS everywhere
- health checks
- staging smoke tests
- alerting for failures

---

## 25) Documentation discipline

You need real docs, not vibes.

### Must-have docs

#### `docs/architecture/`
System design, app boundaries, data flow, and trust boundaries.

#### `docs/security/`
Security model, auth model, authorization model, support access model, and operational security notes.

#### `docs/adr/`
Architecture Decision Records.

### Examples of ADR topics

- why modular monolith
- why PostgreSQL
- why Next + Fastify
- why internal authz engine
- why RLS
- why support access is grant-based not role-based

### Hard rule

If a big architectural choice exists only in chat history and not in docs, it does not exist properly.

---

## 26) Anti-patterns that must be rejected immediately

Reject these even if they feel faster:

### Authorization anti-patterns

- role checks scattered everywhere
- UI-hidden buttons treated as permission enforcement
- platform admin bypassing everything silently
- branch manager treated as tenant owner by accident
- customer authorization done only by trusting customer ID from request payload

### Tenancy anti-patterns

- forgetting `tenant_id` in business tables
- relying only on app code for tenant filters
- allowing platform actors to read tenant data without explicit context or grant
- hidden cross-tenant joins without strict controls

### Backend anti-patterns

- routes directly running business logic and SQL together
- app-wide generic repository abstraction that hides reality
- weak input validation
- permissive writes with unknown properties
- raw DB rows returned directly to UI

### Frontend anti-patterns

- public, ERP, and platform mixed in one app without clean trust boundaries
- business logic inside components
- permissions inferred only in browser state
- frontend deciding tenant isolation

### Security anti-patterns

- no CSRF because “we trust the internal network”
- weak secrets
- permanent support admin access
- no audit trail for sensitive operations
- encrypted secrets without key discipline
- MFA added cosmetically but not enforced by server-side assurance gates

### Infra anti-patterns

- production DB with no restore drill
- logging everything including secrets
- k8s before product-market fit
- Redis before having an actual need
- staging that does not resemble production at all

---

## 27) What must be designed before feature building starts

Before building major product features, define these first:

1. stack choice
2. monorepo structure
3. app split
4. module boundaries
5. auth model
6. authorization model
7. tenancy model
8. DB role and RLS model
9. session model
10. support access model
11. audit model
12. migration discipline
13. CI gates
14. observability baseline
15. coding rules
16. DTO strategy
17. testing strategy
18. environment and deployment model

If these are not defined, the team will make accidental architecture decisions through shortcuts.

---

## 28) Suggested initial implementation order

This is the correct order for a clean build.

### Phase A — Foundation

Build:

- monorepo skeleton
- package boundaries
- typed config
- logging/tracing baseline
- DB connection package
- migration system
- base schema skeleton
- shared validation package

### Phase B — Security and tenancy core

Build:

- session model
- authn primitives
- internal authz engine
- tenant resolution
- DB access context
- RLS on critical tables
- protected route guards

### Phase C — Core business data model

Build:

- tenants
- branches
- services
- employees
- customers
- accounts
- availability primitives
- appointment core model

### Phase D — Public booking surface

Build:

- public tenant page
- customer auth
- booking flow
- booking confirmation
- customer dashboard

### Phase E — Internal ERP surface

Build:

- internal login
- appointments list/detail
- status changes
- customers view
- employees view
- website settings

### Phase F — Platform and support security

Build:

- platform admin console
- tenant context switching with assurance
- support request/approval/grant subsystem
- audit review

### Phase G — Jobs, notifications, reporting basics

Build:

- worker
- outbox
- notification pipeline
- export controls

### Phase H — Verification and hardening

Build:

- regression tests
- CI gates
- security drift tests
- backup and ops verification

---

## 29) What is allowed to be simple at the start

Some things can start simple if the boundary is correct.

Acceptable simplifications early on:

- minimal but clean UI
- reduced reporting depth
- no custom domains yet
- limited notification channels
- basic worker throughput
- simple admin console visuals

### What must not be simplified incorrectly

Do not simplify the following in the wrong way:

- security model
- tenancy enforcement
- authorization design
- support access controls
- auditability
- migration discipline
- testing gates

These are foundations, not polish.

---

## 30) Final recommended blueprint

If Vision is restarted cleanly, this is the recommended blueprint:

### Applications

- `apps/web` → Next.js public booking + customer account
- `apps/erp` → Next.js tenant ERP
- `apps/platform` → Next.js platform admin
- `apps/api` → Fastify backend API
- `apps/worker` → background jobs

### Shared packages

- `packages/ui`
- `packages/design-system`
- `packages/config`
- `packages/db`
- `packages/validation`
- `packages/authn`
- `packages/authz`
- `packages/tenancy`
- `packages/observability`
- `packages/contracts`
- `packages/test-utils`

### Data layer

- PostgreSQL
- strict migrations
- RLS
- strict runtime role
- tenant-scoped schema discipline

### Security

- database-backed sessions
- MFA
- step-up authentication
- centralized internal authorization engine
- support grants instead of permanent bypass
- audit-first design
- deny-by-default

### Engineering discipline

- modular monolith
- explicit module boundaries
- no business logic in routes
- no browser-trusted authz
- CI security gates
- real observability

---

## 31) Short list of absolute rules

If everything else gets ignored, these rules must still survive:

1. Build a modular monolith.
2. Use Next.js for the three frontend surfaces.
3. Use Fastify for the backend.
4. Use PostgreSQL.
5. Enforce tenant isolation in both app logic and DB.
6. Centralize authorization.
7. Use DB-backed sessions and server-enforced MFA/step-up.
8. Treat support access as temporary grants, not a hidden role.
9. Make auditability real.
10. Make security tests merge gates.
11. Do not mix public, ERP, and platform trust surfaces carelessly.
12. Do not let convenience decisions become permanent architecture.

---

## 32) What to do next after adopting this document

After this document is accepted, the next correct outputs are:

1. `ARCHITECTURE.md`
2. `SECURITY_MODEL.md`
3. `TENANCY_MODEL.md`
4. `AUTHORIZATION_MODEL.md`
5. `SUPPORT_ACCESS_MODEL.md`
6. `MONOREPO_STRUCTURE.md`
7. folder skeleton generation
8. schema v1 draft
9. ADR set for major decisions
10. implementation roadmap by phase

Do not jump straight into UI building before these are settled.

---

## 33) Closing position

The right way to build Vision is not to start with visual pages.
The right way is to establish a foundation where:

- structure is intentional
- security is built in
- tenancy is enforced
- internal access is controlled
- testing prevents regression
- architecture stays understandable as the product grows

A project like Vision does not become clean by accident.
It becomes clean because the system has rules, boundaries, and discipline from the first serious commit.

