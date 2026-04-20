# VISION_DAY_ZERO_IMPLEMENTATION_ROADMAP.md

## Vision Day-Zero Implementation Roadmap
**Version:** 1.0  
**Language:** English  
**Audience:** AI implementation agent, founder, technical lead, project manager  
**Status:** Execution roadmap with phase gates

---

## 1. Purpose of This Document

This roadmap defines the **correct build order** for Vision from day zero.

It exists to prevent the most common failure mode in AI-assisted product builds:

- jumping too early into pages
- mixing architecture with feature code
- building screens before trust boundaries
- shipping fake flows without real domain enforcement
- creating a codebase that looks alive but cannot scale safely

This document should be used together with:

1. `Vision_Greenfield_Blueprint.md`
2. `VISION_MASTER_PRODUCT_SPEC.md`

The blueprint defines the architecture.
The master spec defines the product.
This roadmap defines the execution order.

---

## 2. Global Execution Rules

These rules apply to **every phase**.

### 2.1 Never Build UI First
No major product phase starts with visual pages alone.  
The data model, contracts, authorization, and workflows must exist first.

### 2.2 No Silent Scope Drift
Do not invent features that were not requested.  
Do not remove hard requirements for convenience.

### 2.3 Every Sensitive Change Must Be Enforced Server-Side
Permissions, tenant scoping, and role logic must live in backend-enforced rules.

### 2.4 Every Phase Must Have Exit Criteria
A phase is not “done” because screens exist.  
A phase is done when its outputs, tests, and boundaries are real.

### 2.5 No Cross-Phase Shortcuts
Do not implement later-phase complexity inside earlier phases in a rushed way.  
Lay the boundary now, add depth later.

### 2.6 Documentation Must Evolve with the Build
If the implementation changes a structural assumption, update the related documentation.

### 2.7 No Broken Main Branch
Every merged phase must leave the repository buildable, typed, testable, and coherent.

### 2.8 Always Prefer Explicitness Over Cleverness
Explicit modules, contracts, and state transitions beat “smart” abstractions that hide real behavior.

---

## 3. Delivery Philosophy

Vision is large.  
The right approach is **controlled staged construction**.

Each phase below includes:

- objective
- major outputs
- key work items
- mandatory tests/checks
- exit criteria
- anti-patterns to avoid

Do not proceed to the next phase until the current phase is genuinely closed.

---

## PHASE 0 — Program Setup and Control Documents

### Objective
Create the rules of the project before the project creates its own chaos.

### Major Outputs
- final document set in repo
- architecture references in `/docs`
- coding rules
- naming rules
- branching and PR rules
- implementation tracking template

### Key Work Items
- add the three core documents to the repo
- create `/docs/architecture`, `/docs/security`, `/docs/adr`
- define naming conventions for apps, packages, modules, DTOs, and DB tables
- define repository standards for code ownership and module boundaries
- define what counts as a breaking architectural decision
- define required PR template sections:
  - problem
  - scope
  - security impact
  - data model impact
  - tests added
  - docs updated

### Mandatory Checks
- repository contains the three core operating documents
- docs folder structure exists
- execution rules are discoverable by the AI agent

### Exit Criteria
- the project has a written constitution and execution discipline
- the AI agent has a clear source of truth before writing product code

### Anti-Patterns
- starting implementation with no project rules
- storing major decisions only in chat history

---

## PHASE 1 — Monorepo Skeleton and Toolchain Foundation

### Objective
Create the clean repo structure that all later work depends on.

### Major Outputs
- monorepo initialized
- workspace and task orchestration configured
- base applications and packages scaffolded
- shared linting, formatting, and TypeScript baseline

### Key Work Items
- initialize `pnpm` workspace
- configure `turbo`
- create apps:
  - `apps/web`
  - `apps/erp`
  - `apps/platform`
  - `apps/api`
  - `apps/worker`
- create packages:
  - `ui`
  - `design-system`
  - `config`
  - `db`
  - `validation`
  - `authn`
  - `authz`
  - `tenancy`
  - `observability`
  - `contracts`
  - `test-utils`
- set TypeScript project references or equivalent package typing strategy
- configure ESLint and Prettier or equivalent standards
- define import boundaries to reduce cross-module leakage

### Mandatory Checks
- workspace install works
- typecheck works
- each app boots in placeholder mode
- CI can run install + typecheck + lint

### Exit Criteria
- repository structure matches the intended architecture
- no feature code exists in the wrong place
- every app/package has a clear purpose

### Anti-Patterns
- one huge app with everything mixed together
- generic `utils` becoming the dumping ground of architecture

---

## PHASE 2 — Local Infrastructure and Runtime Configuration

### Objective
Make the project boot safely and predictably in local development.

### Major Outputs
- Docker-based local environment
- typed environment configuration
- local PostgreSQL
- local object storage placeholder if needed
- environment validation

### Key Work Items
- create docker compose for local dependencies
- provision PostgreSQL
- add typed config package
- define environment contract per app
- separate local, staging, and production expectations
- ensure app cannot boot with insecure defaults outside local mode
- define secrets strategy for development

### Mandatory Checks
- config package validates env on boot
- bad env fails fast
- local stack boots in a documented way

### Exit Criteria
- developers and AI agent can run the system consistently
- configuration is not scattered across random files

### Anti-Patterns
- reading raw env vars in arbitrary modules
- insecure defaults that would accidentally pass in non-local environments

---

## PHASE 3 — Database Baseline, Migration Discipline, and DB Package

### Objective
Create the database layer correctly before business entities begin multiplying.

### Major Outputs
- DB package foundation
- migration workflow
- schema management discipline
- transaction helpers
- DB connection management

### Key Work Items
- configure Drizzle or chosen typed schema layer
- define migration generation and application flow
- establish runtime app DB role strategy
- create `db/migrations` and seeds structure
- add transaction helper patterns
- document migration rules:
  - no manual production schema drift
  - no ad hoc changes without migrations
  - no destructive changes without controlled plan

### Mandatory Checks
- migration up/down or equivalent workflow works
- local DB reset and reseed works
- CI can validate migrations

### Exit Criteria
- the project has a real schema workflow
- no domain work is being done on informal database changes

### Anti-Patterns
- changing DB structure directly in production
- mixing schema experiments into feature code with no migration record

---

## PHASE 4 — Observability, Logging, Error Model, and Request Context

### Objective
Install the operational spine early so the system can be understood while it grows.

### Major Outputs
- structured JSON logging
- request IDs
- correlation IDs
- base tracing hooks
- consistent API error shape
- request context model

### Key Work Items
- create observability package
- define logger interface
- add request ID generation
- add structured error mapping
- define request context object
- include tenant and subject placeholders in context model
- instrument API and worker boot flows

### Mandatory Checks
- every API request emits traceable logs
- errors are shaped consistently
- worker logs are structured

### Exit Criteria
- the project is observable before complexity increases

### Anti-Patterns
- string logs with no structure
- route-specific ad hoc error responses

---

## PHASE 5 — Authentication Foundation

### Objective
Build real identity handling before touching role behavior or tenant operations.

### Major Outputs
- session model
- password hashing
- customer auth primitives
- internal auth primitives
- login/logout flows
- session revocation model

### Key Work Items
- define subject types: customer and internal
- create sessions table and model
- implement secure password hashing
- implement login service and logout service
- implement session rotation and expiration behavior
- create auth middleware for request resolution
- support separate auth flows for customer and internal users as needed
- define password reset placeholder strategy

### Mandatory Checks
- session-backed login works
- revoked session fails
- expired session fails
- secure cookie settings are enforced where applicable

### Exit Criteria
- identity is real, stateful, and revocable
- the system can reliably distinguish subject types

### Anti-Patterns
- stateless shortcuts with weak session control
- hardcoded fake auth in early feature screens

---

## PHASE 6 — MFA and Assurance Levels for Sensitive Internal Roles

### Objective
Add the security posture required for platform admins, owners, and branch managers.

### Major Outputs
- MFA enrollment flow
- MFA verification flow
- backup codes
- assurance level model
- step-up hooks

### Key Work Items
- support TOTP and backup codes
- store MFA secrets securely
- define assurance levels such as `basic`, `mfa_verified`, `step_up_verified`
- require higher assurance for sensitive internal actions
- track MFA-related security events

### Mandatory Checks
- protected actions fail without required assurance
- MFA enrollment and recovery are auditable
- backup codes are not stored in plaintext

### Exit Criteria
- sensitive internal users are protected by real assurance controls

### Anti-Patterns
- cosmetic MFA that does not gate server-side actions
- one universal assurance state for every action

---

## PHASE 7 — Authorization Engine and Permission Model

### Objective
Install the centralized authorization layer before business modules start checking permissions badly.

### Major Outputs
- internal authorization engine
- action/resource model
- role/scope mapping
- authorization decision API
- deny-by-default behavior

### Key Work Items
- define subject/resource/action vocabulary
- implement `authorize(subject, action, resource, context)`
- implement scoped decisions for tenant and branch
- define platform-specific and tenant-specific permission sets
- create reusable guard layer for API services
- add explanation/debug payload for denied decisions where safe internally

### Mandatory Checks
- unknown resource/action pairs deny
- branch-scoped actor cannot access tenant-wide resources unless allowed
- customer self-access is explicit and narrow

### Exit Criteria
- authorization is centralized and reusable
- routes no longer need scattered role checks

### Anti-Patterns
- `if role === ...` logic spread across the codebase
- frontend deciding what is allowed

---

## PHASE 8 — Tenancy Core and Database Access Context

### Objective
Make tenant boundaries real in both application and database behavior.

### Major Outputs
- tenant resolution model
- active tenant context
- active branch context
- DB access context propagation
- tenancy utilities package

### Key Work Items
- implement tenant resolution rules from session and route context
- define branch context switching rules
- wire context into application services
- prepare DB context variables needed for enforcement
- create tenancy-aware service helpers
- define how multi-branch users switch and persist context safely

### Mandatory Checks
- no tenant-scoped operation runs without explicit tenant context
- branch-specific operations fail if branch scope is invalid
- active branch switching behavior is auditable and predictable

### Exit Criteria
- tenancy is not a routing trick; it is a real execution context

### Anti-Patterns
- trusting only URL slug
- relying on developer memory to include tenant filters

---

## PHASE 9 — Row-Level Security and Database Isolation Hardening

### Objective
Move tenant isolation from intention to enforcement.

### Major Outputs
- RLS on critical tenant-scoped tables
- runtime role without bypass privileges
- DB enforcement tests

### Key Work Items
- identify first critical tables to protect
- enable RLS and force it where required
- pass trusted DB context into transactions
- write integration tests for cross-tenant denial
- validate runtime role privileges

### Mandatory Checks
- cross-tenant read is denied
- cross-tenant write is denied
- missing tenant context fails closed

### Exit Criteria
- critical business data has DB-level tenant enforcement

### Anti-Patterns
- postponing RLS until “later”
- using superuser-style runtime DB credentials

---

## PHASE 10 — Core Platform Provisioning Domain

### Objective
Build the platform’s ability to create and manage tenants before tenant product flows go live.

### Major Outputs
- tenant model
- plan/subscription model
- entitlement model
- owner provisioning flow
- tenant activation/suspension behavior

### Key Work Items
- create tenant tables and services
- create plan/subscription structures
- define entitlements: branch count, employee count, enabled modules, booking website enabled flag
- create owner bootstrap flow
- create onboarding link strategy
- create platform console foundation for tenant list and detail

### Mandatory Checks
- a platform admin can create a tenant
- entitlements are stored and retrievable
- suspension blocks tenant use in expected ways

### Exit Criteria
- the platform can provision real tenants before product modules depend on them

### Anti-Patterns
- hardcoding tenant access in seed files forever
- building booking features before tenants can be provisioned properly

---

## PHASE 11 — Branch Domain and Internal User Domain

### Objective
Create the real internal operating structure under each tenant.

### Major Outputs
- branch model
- internal user model
- role assignment
- branch assignment
- multi-branch access rules

### Key Work Items
- build branch CRUD with tenant scoping
- build internal user creation flow
- link users to roles and branches
- support owner, manager, cashier, receptionist, provider roles
- implement multi-branch selection behavior
- create base ERP navigation shell driven by authorized scope

### Mandatory Checks
- internal users only see assigned branches unless elevated by policy
- single-branch users enter directly
- multi-branch users must choose/switch context appropriately

### Exit Criteria
- each tenant has an actual operational structure

### Anti-Patterns
- assuming one user equals one branch forever
- merging provider identity and admin identity carelessly

---

## PHASE 12 — Customer Accounts and Public Website Foundation

### Objective
Build the customer-facing shell before full booking logic.

### Major Outputs
- public website routing foundation
- customer auth screens
- customer account basics
- tenant branding resolution
- branch-aware public surface

### Key Work Items
- build public site shell
- resolve tenant by public route/domain strategy
- add customer registration/login/reset flows
- build customer account skeleton
- show tenant/branch presentation structure
- prepare service and offer display slots

### Mandatory Checks
- tenant public pages resolve correctly
- customer can register and log in
- no internal data leaks into public surface

### Exit Criteria
- public surface is real and tenant-aware, even if the booking engine is not complete yet

### Anti-Patterns
- mixing ERP/private components into public site routing
- hardcoding one-tenant presentation assumptions

---

## PHASE 13 — Service Catalog, Provider Profiles, Packages, and Website Content Models

### Objective
Build the commercial content model before time-slot logic.

### Major Outputs
- service model
- provider profile model
- package and offer model
- website content/config model
- branch-level pricing and availability controls

### Key Work Items
- implement service CRUD
- implement provider/barber profile relation
- implement package/offer CRUD
- implement branch-level service availability and optional price override
- implement website content configuration entities
- connect display-ready content to public site

### Mandatory Checks
- services can exist tenant-wide but vary by branch
- offers can be enabled/disabled by branch where policy allows
- public site reads only valid public-facing content

### Exit Criteria
- the system can describe what is bookable and how it should be shown

### Anti-Patterns
- building booking flow against placeholder hardcoded service lists
- letting public UI invent pricing logic that is not in the backend

---

## PHASE 14 — Availability Model and Booking Engine Core

### Objective
Create the scheduling and booking core correctly before appointment operations UI expands.

### Major Outputs
- availability primitives
- branch/provider scheduling rules
- booking creation service
- slot validation logic
- booking conflict prevention

### Key Work Items
- define branch working hours model
- define provider working schedule model
- define bookable slot generation strategy
- enforce duration logic
- prevent overlapping provider bookings
- handle provider-selected and provider-unselected bookings
- define booking status lifecycle skeleton

### Mandatory Checks
- invalid slots cannot be booked
- provider overlap is blocked
- booking without provider follows allowed rules
- time calculations are timezone-safe

### Exit Criteria
- the platform can create valid bookings against real rules

### Anti-Patterns
- fake slot generation in frontend only
- overlap checks done only by optimistic UI behavior

---

## PHASE 15 — Public Booking Flow Completion

### Objective
Turn the booking engine into a complete customer flow.

### Major Outputs
- service/package selection UI
- branch selection UI
- provider selection UI when enabled
- date/time selection
- booking confirmation
- customer booking history view
- cancel/reschedule actions where allowed

### Key Work Items
- wire public site to booking APIs
- implement policy-aware booking modification rules
- implement public appointment detail view
- handle branch-specific presentation
- handle provider-selection configuration hierarchy
- build good validation and customer messaging

### Mandatory Checks
- a customer can complete a booking end to end
- booking history is visible in account
- disabled provider selection does not appear
- multi-branch choice behaves correctly

### Exit Criteria
- the customer-facing booking journey is fully usable

### Anti-Patterns
- allowing frontend-only booking success with no durable backend record
- treating public confirmation pages as proof of a saved booking when nothing is committed

---

## PHASE 16 — ERP Appointment Operations Module

### Objective
Build the internal appointment operations experience on top of the real booking domain.

### Major Outputs
- appointments list and calendar
- appointment detail view
- confirm/reschedule/cancel/no-show actions
- assignment operations
- quick-call action
- branch-scoped views

### Key Work Items
- implement internal appointment queries
- implement appointment action services
- build detail side panel or page
- include customer history snapshot
- include unassigned queue
- implement operator workflows for same-day operation

### Mandatory Checks
- appointment actions enforce authorization
- branch-scoped users do not see other branches
- state transitions are tracked and validated

### Exit Criteria
- internal teams can operate daily bookings professionally

### Anti-Patterns
- allowing any internal user to change any booking everywhere
- mutating statuses without history

---

## PHASE 17 — Provider Workspace and Schedule Views

### Objective
Give providers a controlled operational experience without overexposing branch systems.

### Major Outputs
- provider schedule view
- provider appointment list
- provider detail permissions
- optional provider performance view

### Key Work Items
- create provider-scoped dashboard
- show assigned appointments
- show workday schedule
- restrict provider visibility to what they need
- prevent provider account from becoming accidental admin access

### Mandatory Checks
- providers only see appropriate appointments and data
- provider permissions remain narrow

### Exit Criteria
- providers can operate with clarity without compromising security

### Anti-Patterns
- reusing manager screens for providers with hidden buttons instead of real scope reduction

---

## PHASE 18 — POS, Invoice, Receipt, and Payment Flow

### Objective
Build the revenue-closing workflow that turns appointments and walk-ins into real business records.

### Major Outputs
- POS service sale flow
- invoice model
- invoice line items
- payment method capture
- receipt generation
- provider-required invoice closure logic

### Key Work Items
- implement invoice creation and closure services
- support service and product line items
- require customer phone number
- require provider assignment for service closure
- generate printable receipt output
- link invoice to branch, cashier, customer, provider
- support walk-in and booking-linked sales

### Mandatory Checks
- invoice cannot close without required data
- service invoices always map to a provider
- receipt output matches invoice data
- payment method is persisted

### Exit Criteria
- the core sales loop works for both booked and walk-in customers

### Anti-Patterns
- POS that is visually complete but does not create durable accounting records
- allowing providerless service invoices

---

## PHASE 19 — Treasury / Cash Drawer Operations

### Objective
Add branch cashier control so POS does not stay operationally shallow.

### Major Outputs
- shift opening
- cash drawer tracking
- handover support
- cash vs card totals
- branch treasury rollups

### Key Work Items
- define shift records
- define drawer state model
- connect invoice payments to drawer aggregates
- support handover workflow
- provide branch-level cash summary views

### Mandatory Checks
- shift totals reconcile with invoice activity
- handover records are durable and auditable

### Exit Criteria
- cashier operations reflect real branch handling instead of fake checkout logs

### Anti-Patterns
- treating treasury as a spreadsheet problem outside the system

---

## PHASE 20 — Inventory Domain and Product Sales Integration

### Objective
Make product sales affect stock reality.

### Major Outputs
- product model
- branch stock model
- stock adjustment flow
- POS stock deduction integration

### Key Work Items
- build product catalog basics
- build branch stock balance logic
- support manual stock adjustments with permission control
- deduct stock on product sale
- expose stock visibility in branch operations
- define low-stock extension path for later if desired

### Mandatory Checks
- selling a product updates stock
- branch stock does not leak across branches
- unauthorized users cannot adjust stock

### Exit Criteria
- inventory is connected to operations and sales

### Anti-Patterns
- product sales that do not affect stock
- one global stock pool pretending to serve branch operations

---

## PHASE 21 — Customer History, Receipt History, and Identity Linking

### Objective
Make the customer record truly useful across online and offline behavior.

### Major Outputs
- customer booking history
- customer invoice history
- identity linking behavior
- offline-to-account continuity rules

### Key Work Items
- unify customer records across booking and POS where possible
- expose invoice history in customer account when identity is sufficient
- distinguish online booking records from offline visit history where needed
- define policy for historical visibility once email/account becomes available

### Mandatory Checks
- invoices are not lost because the email was missing earlier
- customer account shows correct history without leaking unrelated records

### Exit Criteria
- the customer experience becomes cumulative, not fragmented

### Anti-Patterns
- splitting booking customers and POS customers into disconnected universes forever

---

## PHASE 22 — Website Builder / Customization Experience

### Objective
Deliver a premium owner-facing configuration surface for the public website.

### Major Outputs
- branding settings UI
- logo and color settings
- content ordering
- public preview
- site presentation controls

### Key Work Items
- create website management module in ERP
- wire configuration to public rendering
- support realistic preview mode
- structure content blocks cleanly
- maintain permission checks for who can edit branding/public content

### Mandatory Checks
- owners can change branding without breaking public site
- preview reflects actual public output
- branch-level presentation rules behave as intended

### Exit Criteria
- website configuration is strong enough to feel like a paid business feature, not a hidden config panel

### Anti-Patterns
- raw JSON config editors as the main owner experience
- visual customization disconnected from real public rendering

---

## PHASE 23 — Notifications and Operational Reminders

### Objective
Support appointment reliability and internal operational awareness.

### Major Outputs
- notification event model
- worker-driven notification flow
- booking confirmations
- provider reminders
- alerts for unassigned upcoming bookings

### Key Work Items
- define notification event types
- create outbox-backed notification processing
- send booking confirmation messages
- notify provider when an assigned appointment is approaching
- notify internal staff when an unassigned booking is nearing start
- store delivery attempts and logs

### Mandatory Checks
- notifications are idempotent
- failed sends are visible
- worker retries are controlled

### Exit Criteria
- key operational moments generate reliable notifications

### Anti-Patterns
- sending notifications inline inside HTTP requests with no durability
- silent notification failures

---

## PHASE 24 — Ticketing and Platform Support Operations

### Objective
Build the feedback and support workflow between tenants and the platform team.

### Major Outputs
- ticket creation
- ticket state machine
- ticket assignment
- ticket response history
- platform support work queue

### Key Work Items
- build ticket domain and APIs
- add ERP ticket submission UI
- add platform ticket operations UI
- define statuses and assignments
- audit ticket changes
- connect ticket to tenant and user context

### Mandatory Checks
- tenant users can only see their own tickets
- platform users can operate tickets according to platform role scope
- ticket changes are durable and visible

### Exit Criteria
- the system has a built-in support workflow

### Anti-Patterns
- relying on external chat/manual process for core tenant support while pretending the feature exists

---

## PHASE 25 — Controlled Platform Support Access and Internal IT Mode

### Objective
Provide platform internal access without destroying trust boundaries.

### Major Outputs
- support access request/grant model
- time-bounded access
- access mode controls
- audit trail
- internal tenant-entry workflow

### Key Work Items
- define support grant domain
- support read-only and elevated-write modes if needed
- bind support access to tenant and time window
- expose platform workflow for grant activation and revocation
- log every support access event
- require step-up assurance for sensitive access

### Mandatory Checks
- support access expires correctly
- read-only support cannot write
- no support user has invisible permanent tenant-wide bypass

### Exit Criteria
- platform support can operate without compromising the security model

### Anti-Patterns
- secret super admin route
- unlogged support impersonation

---

## PHASE 26 — Dashboards, KPI, and Reporting Foundation

### Objective
Turn operational data into useful decision support.

### Major Outputs
- branch dashboards
- provider KPI views
- owner dashboards
- platform KPI views
- reporting query layer

### Key Work Items
- define metric calculations carefully
- build branch-level operational dashboard
- build provider performance views
- build owner cross-branch dashboard
- build platform oversight dashboard
- ensure metrics are derived from durable business events, not UI counters

### Mandatory Checks
- metrics are explainable
- dashboard numbers reconcile with underlying records
- scope enforcement applies to reporting too

### Exit Criteria
- reports become decision tools instead of decorative charts

### Anti-Patterns
- fake KPI counters with inconsistent definitions
- unrestricted analytics queries across tenant boundaries

---

## PHASE 27 — Security Regression Suite and Architecture Guard Rails

### Objective
Freeze the foundations so later feature work cannot quietly break them.

### Major Outputs
- security regression tests
- architecture guard tests
- protected route coverage
- support-access coverage
- tenant isolation coverage

### Key Work Items
- add tests for cross-tenant denial
- add tests for expired/revoked session denial
- add tests for missing assurance denial
- add tests for read-only grant write denial
- add tests for DTO allowlist enforcement
- add tests to prevent forbidden import directions or architecture drift

### Mandatory Checks
- security tests run in CI
- failing security tests block merge
- protected routes have coverage

### Exit Criteria
- the project gains resistance to architectural regression

### Anti-Patterns
- relying on manual review only for critical security behavior
- considering security tests “nice to have”

---

## PHASE 28 — Staging, Production Readiness, Backups, and Restore Validation

### Objective
Make the system deployable and survivable.

### Major Outputs
- staging environment
- production environment
- health checks
- deployment pipeline
- backup and restore runbook
- operational alerts

### Key Work Items
- prepare deployment manifests/Docker strategy
- configure reverse proxy and TLS
- validate staging boot sequence
- add readiness and health endpoints
- automate backups
- test restore procedure
- define incident basics and recovery checklist
- validate object storage and media behavior if applicable

### Mandatory Checks
- staging resembles production enough to be useful
- restore drill succeeds
- deploy pipeline is repeatable

### Exit Criteria
- the product can survive real-world operations

### Anti-Patterns
- production deployment with no restore test
- staging that bears no relation to production

---

## PHASE 29 — Final Hardening, UX Polish, and Launch Gate

### Objective
Close the gap between technically working and launch-ready.

### Major Outputs
- performance pass
- UX polish pass
- accessibility pass where practical
- copy cleanup
- bug triage closure
- launch checklist

### Key Work Items
- remove rough edges in critical flows
- review error states and empty states
- optimize expensive queries
- review logs and alert noise
- confirm branch/user/module entitlement behavior
- confirm billing/subscription visibility
- execute final end-to-end scenarios

### Mandatory Checks
- key user journeys pass:
  - tenant provisioning
  - owner onboarding
  - branch creation
  - internal user creation
  - online booking
  - appointment assignment
  - POS closure
  - inventory deduction
  - ticket submission
  - support access control
- major defects are closed or explicitly waived

### Exit Criteria
- the system is coherent, operational, and ready for controlled launch

### Anti-Patterns
- launching because “the main pages are there”
- skipping operational walkthroughs

---

## 4. Parallel Work Rules

Some work can happen in parallel, but only when boundaries are respected.

### Safe Parallel Tracks
- design system work alongside early domain build
- public UI shells after auth/tenancy foundations are clear
- reporting UI after metric definitions are stable
- notification channel implementation after outbox/event model exists

### Unsafe Parallel Tracks
- building POS before invoice and provider rules are defined
- building dashboards before durable event definitions
- building public booking UX before scheduling rules
- building platform support entry before access-control model

---

## 5. What the AI Agent Must Never Do

The AI agent must not:

- collapse all surfaces into one app for convenience
- hardcode tenant assumptions
- skip authorization because “it will be added later”
- invent database structure inside route handlers
- treat seed data as the real provisioning model
- create support backdoors
- use UI visibility as permission enforcement
- implement business rules only in frontend code
- move faster by ignoring tests in sensitive areas

---

## 6. What Completion Really Means

A phase is complete only when all of the following are true:

- code exists in the correct module boundaries
- contracts are explicit
- tests exist for the phase’s sensitive behavior
- authorization and tenancy enforcement are real
- docs are updated where structural assumptions changed
- CI remains green
- the repository remains understandable

---

## 7. Final Position

Vision should be built like an actual long-term SaaS product, not like a demo that accidentally grew legs.

The correct order is:

1. control documents
2. repo and toolchain
3. runtime and database discipline
4. auth and authorization
5. tenancy and DB isolation
6. platform provisioning
7. branch and user structure
8. public booking foundation
9. service/content models
10. booking engine
11. ERP appointment operations
12. POS and inventory
13. customer continuity
14. website builder
15. notifications
16. support/ticketing
17. dashboards
18. security regression
19. deployment hardening
20. launch gate

That order is what protects the build from turning into a beautiful mess.
