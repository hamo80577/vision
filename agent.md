# agent.md

## Vision Build Agent Operating Manual
**Version:** 1.0  
**Language:** English  
**Audience:** AI implementation agent building Vision  
**Status:** Mandatory operating rules and execution protocol

---

## 1. Purpose of This File

This file tells the AI implementation agent **how to behave while building Vision**.

It is not the architecture blueprint.
It is not the product specification.
It is not the roadmap.

It is the **operating manual for the builder**.

Its job is to prevent the most common AI-build failures:

- building pages before the system foundations exist
- inventing architecture while coding
- drifting away from the required scope
- implementing fake features with no real domain enforcement
- weakening security for speed
- mixing public, tenant, and platform trust surfaces
- producing code that looks complete but is structurally wrong

This file must be used together with the three core project documents:

1. `Vision_Greenfield_Blueprint.md`
2. `VISION_MASTER_PRODUCT_SPEC.md`
3. `VISION_DAY_ZERO_IMPLEMENTATION_ROADMAP.md`

---

## 2. Order of Authority

When working on Vision, follow this order of authority:

### Level 1 — This File (`agent.md`)
This file controls **execution behavior**, work discipline, sequencing behavior, and non-negotiable implementation conduct.

### Level 2 — `Vision_Greenfield_Blueprint.md`
This is the **architectural constitution**.
It defines the required stack, system shape, module boundaries, tenancy model, security model, and anti-patterns that must be rejected.

### Level 3 — `VISION_MASTER_PRODUCT_SPEC.md`
This is the **product and business behavior specification**.
It defines the surfaces, actors, workflows, business rules, modules, and operational logic.

### Level 4 — `VISION_DAY_ZERO_IMPLEMENTATION_ROADMAP.md`
This defines the **correct build order** and the expected outputs of each phase.

### Conflict Rule
If there is ever a conflict:

- this file controls **agent behavior**
- the blueprint controls **architecture**
- the master spec controls **product behavior**
- the roadmap controls **execution order**

Do not resolve conflicts by improvising silently.
If a real conflict appears, document it explicitly and propose a controlled resolution.

---

## 3. Mission

Your mission is to build Vision as a **real multi-tenant SaaS platform** for barbershops, salons, and chains.

You are not building:

- a pretty demo
- a booking-only toy app
- a front-end mockup with fake backend behavior
- a POS in isolation
- an ERP in isolation
- a platform admin dashboard that bypasses tenant boundaries

You are building a system with three product surfaces that must remain structurally clean:

1. public booking website
2. tenant ERP
3. platform admin console

These must be connected through real backend rules, real data boundaries, real sessions, real authorization, and real auditability.

---

## 4. Non-Negotiable Architecture Summary

You must internalize these rules before writing feature code:

- Vision is a **modular monolith**, not microservices.
- There are **three separate frontend apps**: `web`, `erp`, `platform`.
- There is **one main backend API** and **one worker service**.
- PostgreSQL is the primary production database.
- Tenant isolation must exist in both **application logic** and **database enforcement**.
- Authorization must be **centralized**, not scattered across route handlers and components.
- Sessions must be **database-backed**.
- Sensitive internal roles must support MFA and step-up verification.
- Support access must be **grant-based**, not a hidden permanent superadmin mode.
- UI is not the trust boundary. The backend is.
- Route handlers are transport adapters, not business logic containers.
- Public, ERP, and platform trust surfaces must not be mixed carelessly.

If your implementation drifts from these rules, it is wrong even if the UI works.

---

## 5. Product Summary You Must Preserve

Vision is an operating system for beauty and grooming businesses.

The product begins with booking and continues through branch execution, cashier invoicing, inventory adjustment, reporting, and owner visibility.

The end-to-end chain matters:

1. owner configures services, offers, packages, prices, availability, and website content
2. customer browses public booking website
3. customer books an appointment
4. booking appears in ERP operations
5. booking is assigned to a provider if needed
6. visit is fulfilled in branch
7. invoice is created in POS
8. provider attribution is mandatory before invoice close
9. payment is recorded
10. receipt is issued
11. inventory is deducted when products are sold
12. metrics flow into branch, provider, tenant, and platform dashboards

Do not reduce Vision to a disconnected set of screens.
It is one operational graph.

---

## 6. Mandatory Reading Protocol Before Coding

Before implementing any non-trivial change, do the following:

### Step 1 — Read for architecture
Read the relevant sections of `Vision_Greenfield_Blueprint.md`.
Understand app boundaries, backend module structure, tenancy, authn/authz, worker responsibilities, and anti-patterns.

### Step 2 — Read for business logic
Read the relevant sections of `VISION_MASTER_PRODUCT_SPEC.md`.
Understand actors, workflows, branch behavior, booking rules, POS rules, offer rules, and reporting expectations.

### Step 3 — Read for phase alignment
Read the relevant phase from `VISION_DAY_ZERO_IMPLEMENTATION_ROADMAP.md`.
Confirm that the work you are about to do belongs in the current phase.

### Step 4 — Inspect the current codebase
Do not assume the repo matches the docs.
Inspect the real implementation before changing anything.

### Step 5 — Map impact explicitly
Identify:

- which app(s) are affected
- which backend module(s) are affected
- which DB tables are affected
- which session/authz rules are affected
- which tests must be added or updated
- which docs must be updated

If you cannot map impact clearly, you are not ready to code.

---

## 7. Required Delivery Behavior

For every meaningful implementation task, follow this sequence:

1. identify the target behavior
2. identify the architectural boundary
3. identify the affected domain module(s)
4. define or update DTOs and validation
5. implement or update backend business rules
6. implement or update persistence behavior
7. add or update authorization checks
8. add or update tests
9. then build or modify UI
10. then update documentation if the structure changed

### Critical Rule
Never start with UI if the workflow depends on backend rules that do not exist yet.

A screen without real enforcement is not progress.
It is future rework.

---

## 8. Strict Anti-Drift Rules

You must not do any of the following:

### 8.1 No Architecture Drift
Do not casually introduce:

- microservices
- a second backend service for convenience
- a separate auth service
- mixed frontend routing that collapses trust surfaces
- ad hoc infra complexity without documented need

### 8.2 No Product Drift
Do not invent large features not present in the spec.
Do not remove required business rules just to simplify implementation.

### 8.3 No Trust Drift
Do not let permissions migrate into frontend conditions.
Do not trust URL slug, form payloads, or browser state as security truth.

### 8.4 No Data Drift
Do not create tenant-scoped business tables without `tenant_id`.
Do not create branch-scoped tables without `branch_id` when branch scope is real.
Do not allow cross-tenant data leakage through convenience joins or weak repository filters.

### 8.5 No Temporary Hacks That Become Permanent
Do not add hidden bypasses, magic defaults, backdoor admin logic, or placeholder flows that undermine the final architecture.

If a temporary measure is unavoidable, it must be:

- explicitly marked
- tightly scoped
- documented
- tracked for removal
- not destructive to the target architecture

---

## 9. Operating Principles for Domain Modeling

You must model Vision around domains, not around screens.

The backend must be organized into coherent business modules such as:

- auth
- tenants
- branches
- services
- offers
- packages
- customers
- employees
- booking
- appointments
- website
- POS
- invoicing
- treasury
- inventory
- notifications
- tickets
- subscriptions
- platform-access
- support-access
- audit
- reporting

Each module should preserve a clean separation between:

- domain logic
- application orchestration
- infrastructure / repositories
- contracts / DTOs

Do not build giant route files that directly execute business logic and SQL.
Do not create one giant `service.ts` file that becomes the entire product.

---

## 10. Mandatory Security Posture

You must build with a security-first baseline, not as a later polish pass.

### 10.1 Authentication
- database-backed sessions
- revocable sessions
- expiring sessions
- secure cookie handling where applicable
- no JavaScript-readable auth cookies for critical flows
- no weak password storage
- use a strong password hashing algorithm such as Argon2id

### 10.2 Authorization
- deny by default
- explicit action/resource checks
- central authorization logic
- no scattered role strings as the true source of power
- no UI-only permission enforcement

### 10.3 Tenant Isolation
- server-side tenant resolution
- database-level enforcement where defined
- no trust in user-supplied tenant values
- no blind filtering assumptions

### 10.4 Support Access
- no permanent hidden superadmin bypass
- support access must be explicit, time-bounded, scoped, auditable, and revocable
- read-only by default

### 10.5 Auditability
Sensitive actions must be traceable.
This includes at least:

- authentication events
- sensitive settings changes
- support access approvals and activation
- subscription changes
- booking state changes where needed
- invoice close events
- cashier and treasury transitions where needed

---

## 11. Business Rules You Must Preserve

These rules are core product behavior and may not be quietly broken.

### Booking Rules
- online booking is created by the customer without online payment in the current planned scope
- customer may choose a branch if the tenant has more than one branch
- customer may choose a provider if provider selection is enabled by owner and allowed by the branch
- customer may also leave provider unselected
- if provider is not selected at booking time, operational staff must be able to assign one later
- booking must be visible in ERP operations
- booking must support statuses such as pending, confirmed, rescheduled, cancelled, no-show, and completed where applicable

### ERP Rules
- owner can manage chain-wide behavior and access branch-level data
- branch manager is branch-scoped unless explicitly granted broader scope
- a user with access to multiple branches must be able to switch context
- a user with access to only one branch may enter directly into that branch context

### Service / Offer / Package Rules
- owner can define services, packages, offers, and website-visible content
- branches may control local availability and local pricing where the product spec allows this
- website display must reflect what is really available and allowed

### POS Rules
- POS must support services and products in one transaction model when relevant
- closing an invoice requires a provider attribution
- even offline customers must be tied to a provider on the invoice
- a customer phone number is mandatory at invoice close
- payment method must be captured
- receipt issuance is part of the flow

### Customer Identity / Receipt Rules
- if the customer does not yet have an email, invoice history may be stored until the account becomes linkable
- customer history must distinguish between online bookings and in-branch transactions where relevant

### Inventory Rules
- branch-level stock matters
- product sale from POS must adjust inventory
- inventory access must be permission-scoped

### Notification Rules
- upcoming appointment notifications should reach the assigned provider where required
- operational flows must support confirmation calls or direct contact actions for bookings

Never flatten these rules into simplistic CRUD if the workflow is actually stateful.

---

## 12. UI/UX Implementation Rules

The UI matters, but it does not come first.

### 12.1 Public Website
The public booking website must look polished and trustworthy.
It should feel like a real customer-facing brand experience.

### 12.2 ERP
The ERP is a heavy-use operational tool.
It must optimize clarity, speed, visibility, and precision.
The owner-facing website settings/editor area must feel premium, because it is part of the subscription value.

### 12.3 Platform Admin
The platform admin surface must feel controlled, operational, and serious.
It is not a clone of ERP.
It is a separate trust surface.

### 12.4 UI Rule
Never use UI polish to hide missing architecture.
Do not treat a clickable dashboard as proof of a real system.

---

## 13. Phase Discipline

The roadmap must be respected.

### Do not do this:
- build tenant website customization before authn/authz and tenancy are real
- build POS before core customer/provider/branch/service models are stable enough
- build reporting before source transactions are reliable
- build platform-wide support access before the support grant model exists
- build advanced settings screens before the underlying state model exists

### Do this instead:
- close each foundation phase properly
- keep structural work ahead of visual work
- add depth only after boundaries are in place

If a task belongs to a later phase, do not smuggle it into the current phase through shortcuts.

---

## 14. Testing and Proof Expectations

For every sensitive or structural feature, add proof.

### Required categories as applicable
- unit tests for pure business logic
- service tests for application orchestration
- integration tests for route, auth, DB, and tenancy behavior
- end-to-end tests for critical user flows
- security regression tests where the feature affects authn/authz/tenancy/support access

### Mandatory principle
A feature is not done because it renders correctly.
A feature is done when:

- it behaves correctly
- it enforces rules correctly
- it is scoped correctly
- it is tested correctly
- it does not violate architecture

---

## 15. Documentation Update Rules

You must keep the docs alive.

Update docs when you change any of the following:

- module boundaries
- auth model assumptions
- authorization resource/action model
- DB schema structure in ways that affect architecture or domain meaning
- support access behavior
- workflow rules in a meaningful way
- phase sequencing assumptions

### Hard rule
If a major structural decision only exists in code and not in docs, the system is drifting.

Use ADRs for major decisions that change the expected design logic.

---

## 16. Definition of “Done Properly”

A task is only properly done when all of the following are true:

1. it aligns with the blueprint
2. it aligns with the product spec
3. it belongs to the current roadmap phase or is explicitly approved as a dependency
4. it is implemented in the correct app/module/package
5. validation exists where required
6. authn/authz enforcement exists where required
7. tenant/branch scoping exists where required
8. tests exist where required
9. docs are updated if structural assumptions changed
10. the change leaves the repo coherent, buildable, and typed

If one of these is missing, the work is incomplete.

---

## 17. Code Quality Standards

### 17.1 Prefer explicit code
Favor clarity over abstraction theater.

### 17.2 Avoid architecture leakage
Do not let apps reach into each other’s private concerns.
Do not let shared packages become dumping grounds.

### 17.3 Make states real
For workflows like appointments, invoices, support grants, and tickets, represent state transitions intentionally.
Do not mutate reality casually.

### 17.4 Reject mass assignment
Never trust broad client payloads for sensitive writes.
Use explicit DTO allowlists.

### 17.5 Keep money and time correct
- money in integer minor units
- timestamps stored in UTC
- display timezone handled intentionally

### 17.6 Respect boundaries
- route layer = transport
- application layer = orchestration
- domain layer = business rules
- infrastructure layer = persistence and adapters

---

## 18. How to Handle Uncertainty

If something is unclear, do not guess recklessly.

Use this order:

1. inspect the existing docs
2. inspect the current codebase
3. infer from architecture and business rules
4. make the smallest safe assumption
5. document the assumption if it affects structure

Do not invent entire subsystems because a detail is missing.
Do not weaken requirements because a detail is inconvenient.

If a choice changes architecture or product meaning, document the decision.

---

## 19. How to Handle Existing Mess

If the repository already contains bad patterns, do not blindly build on top of them.

Instead:

1. identify the violation
2. classify whether it blocks current work
3. repair the boundary if necessary before extending the feature
4. avoid copying the bad pattern into new code

Examples of violations that should not be propagated:

- route-level SQL and business logic mixed together
- scattered role checks
- missing tenant scoping
- giant files with multiple domain responsibilities
- fake admin bypasses
- public and internal logic mixed together
- untyped payload handling

Do not multiply structural debt.

---

## 20. Expected Working Loop for Every Implementation Slice

For each slice of work, the correct loop is:

1. read the relevant docs
2. inspect existing code
3. define the minimal correct target
4. identify impacted modules and tables
5. implement backend-first enforcement
6. add/update tests
7. implement UI or UX support
8. verify typecheck, lint, and test health
9. update docs if required
10. summarize what was completed, what remains, and any open risks

This loop must repeat throughout the project.

---

## 21. First-Move Protocol From Day Zero

When starting the project from scratch, your first priorities are not visual.

They are:

1. establish repo structure
2. establish config discipline
3. establish DB and migration discipline
4. establish request context, logging, and error model
5. establish sessions, authn, and authz core
6. establish tenancy and DB enforcement model
7. establish foundational business entities
8. only then move into booking and ERP workflows

The roadmap document already defines the staged order.
Do not compress it into chaos.

---

## 22. Final Hard Rules

If you forget everything else, do not forget these:

1. Do not build a demo. Build a system.
2. Do not build UI first when backend truth does not exist.
3. Do not weaken security for speed.
4. Do not collapse public, ERP, and platform boundaries.
5. Do not trust the browser with authorization.
6. Do not trust user-supplied tenant context.
7. Do not skip tests on sensitive features.
8. Do not introduce hidden superadmin access.
9. Do not improvise architecture silently.
10. Do not move to the next phase until the current one is real.

---

## 23. Builder Commitment

When you build Vision, you are expected to act like a disciplined implementation partner, not a code generator chasing visual output.

You must preserve:

- structural clarity
- tenant safety
- backend truth
- controlled permissions
- operational integrity
- extensibility
- auditability
- execution discipline

Vision will only stay strong if the build process itself stays strong.

This file exists to enforce that.
