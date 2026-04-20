# Phase 4 Observability Baseline Design

## Purpose

This design defines Vision Phase 4: observability, logging, error model, and request context baseline.

The goal is to install the operational spine early so API and worker execution paths become observable before auth, tenancy, and business complexity expand.

## Scope

This slice covers:

- a real `@vision/observability` package instead of the current placeholder
- structured JSON logging shared across API and worker runtimes
- required baseline context fields `requestId` and `correlationId`
- optional `traceId` support through a tracing hook boundary
- shared context types with reserved optional fields for future `subject`, `tenant`, and `branch` context
- shared Problem Details-style types and helpers
- shared error classification helpers and baseline internal error codes
- Fastify request context wiring and response header propagation in `apps/api`
- Fastify-specific error-to-response mapping in `apps/api`
- worker-side structured logging and context generation in `apps/worker`
- minimal runtime config additions only if needed to keep the baseline coherent
- tests that prove the baseline behavior
- documentation for observability boundaries and non-goals

This slice does not cover:

- telemetry vendor selection
- exporter or provider deployment wiring
- collector integration
- tracing backend setup
- dashboards or alerting rollout
- full metrics platform setup
- a large error taxonomy
- auth, tenancy, or domain-specific context population beyond the reserved optional fields

## Phase Boundary

Phase 4 owns the baseline observability contract only.

It creates the hooks, shared types, and runtime adapters that later phases will build on top of. It must not smuggle in infrastructure-hardening work that belongs later, such as vendor SDK deployment setup, collector configuration, dashboard definition, or alert routing.

## Approved Approach

The approved approach is:

- use `@vision/observability` as the single source of truth for shared observability contracts
- keep the shared package transport-agnostic
- keep Fastify-specific request and error response adaptation inside `apps/api`
- keep worker-specific startup and operation logging adaptation inside `apps/worker`
- treat `requestId` and `correlationId` as required context fields everywhere
- treat `traceId` as optional and derived from the tracing hook when available
- model API failures using a lightweight Problem Details-style response contract
- use no-op tracing by default so the package stays coherent without forcing telemetry deployment setup

This keeps the package boundary clean while still making API and worker flows operationally traceable from Phase 4 onward.

## Architecture

Phase 4 should follow the shared-baseline approach instead of centering observability inside Fastify or forcing early OpenTelemetry deployment concerns.

`packages/observability` becomes the common contract layer for:

- logger creation
- context types and context helpers
- ID validation and generation
- safe log field shaping and redaction helpers
- Problem Details types and helpers
- shared error classification types and stable error codes
- tracing hook types with a default no-op implementation

`apps/api` becomes a thin Fastify adapter over those contracts:

- build or derive request context for each request
- create request-scoped logging
- return sanitized request and correlation IDs in response headers
- map application or framework failures into HTTP responses

`apps/worker` becomes a thin worker adapter over the same contracts:

- create process and operation context without HTTP input
- emit structured startup and operation logs
- use the same context shape and log field conventions as the API

## Shared Context Contract

The shared context contract should be deliberately narrow and stable.

The base context must include:

- required `requestId`
- required `correlationId`
- optional `traceId`

The base context should also include reserved optional fields for later phases, such as:

- `subject`
- `tenant`
- `branch`
- `service`
- `environment`

The contract must support child logger creation so both API and worker logs inherit consistent context without each app redefining field names or formatting.

The context helpers must validate incoming IDs and generate new safe values when incoming header values are malformed, oversized, or otherwise unsafe to trust.

## ID Rules

Phase 4 needs explicit ID hygiene rules because request and correlation IDs will flow through logs and responses.

The design should:

- read `x-request-id` and `x-correlation-id` in `apps/api`
- validate the incoming values against a narrow safe format
- reject malformed or unsafe values
- regenerate safe IDs when input is missing or invalid
- use the sanitized or generated values in request context
- return the sanitized or generated values in response headers

Worker flows have no incoming headers, so worker context helpers should always mint baseline-safe IDs for startup and operation logging.

## Logging Model

The logging baseline must be structured JSON from the start.

The shared package should define a logger interface and helpers that encourage stable field naming and safe metadata capture. The implementation can stay lightweight, but the output shape must already be machine-friendly and consistent.

Logs should include:

- timestamp
- severity
- service name
- environment
- message or event name
- request or operation context
- safe structured metadata relevant to the event

Logs must not expose:

- secrets
- passwords
- raw MFA material
- stack traces in default client-facing paths
- unnecessary PII
- arbitrary exception dumps

Redaction and safe serialization helpers belong in `@vision/observability` so API and worker code do not each invent their own unsafe logging behavior.

## Problem Details Contract

Phase 4 should model API errors as a lightweight Problem Details-style contract from the start.

The baseline response shape is:

- `type`
- `title`
- `status`
- `detail`
- `instance`

Supported extensions for this phase are:

- stable `code`
- optional `traceId`
- optional `errors` array for validation-shaped failures only

The contract should stay intentionally small. Phase 4 does not need a complete error taxonomy or a large hierarchy of custom error classes.

## Error Classification Boundary

`@vision/observability` should define:

- shared problem payload types
- baseline internal error codes
- shared error classification helpers
- helpers for building safe problem payloads

`apps/api` should define:

- Fastify-specific exception inspection
- HTTP status selection
- mapping from thrown values or Fastify errors into the shared problem contract
- response serialization and header behavior

This keeps the shared package transport-agnostic while still allowing HTTP-specific behavior to stay explicit in the API app.

## API Request And Response Behavior

For each API request, the Fastify adapter should:

1. read incoming request and correlation IDs
2. validate or regenerate them
3. derive request context
4. optionally attach a `traceId` from the tracing hook if available
5. create a request-scoped logger
6. expose sanitized IDs in response headers
7. emit structured request completion logs
8. map failures into the Problem Details contract

The request completion log should include at least:

- HTTP method
- sanitized route path
- response status
- duration
- request context fields

The error path should emit structured logs that keep the richer internal detail in logs rather than client payloads.

## Safe Error Response Rules

The API baseline must fail safely.

Rules for Phase 4:

- `instance` must be a sanitized request path only
- `instance` must not include a full URL
- `instance` must not include query string content
- fallback 500 responses must use a stable safe payload
- client payloads must not include stack traces, raw exception objects, secrets, or unnecessary PII
- default logs must avoid raw unsafe dumps while still preserving enough structured detail for debugging

Unknown errors should collapse to a consistent 500 problem payload with a stable `code` and optional `traceId` when available.

## Tracing Hook Boundary

Phase 4 should introduce tracing hooks without forcing real telemetry platform integration.

`@vision/observability` should define:

- tracing hook interfaces
- a default no-op tracer implementation
- a minimal way to wrap an operation and optionally surface a `traceId`

This boundary exists so later infrastructure-hardening work can plug in real tracing providers without changing API and worker calling code.

Phase 4 must not add:

- exporter endpoints
- provider deployment setup
- collector integration
- vendor-specific rollout logic

## Worker Observability Behavior

The worker must use the same shared baseline even though it does not process HTTP requests.

The worker adapter should:

- create structured startup logs
- create operation context for each logical unit of work
- mint required `requestId` and `correlationId` values for each baseline context
- optionally include `traceId` if a tracing hook provides one
- emit safe structured logs for operation start, success, failure, and idle status where relevant

Worker logs should include:

- service name
- environment
- event name
- severity
- request or operation context
- safe outcome metadata

This keeps API and worker observability aligned before real background job infrastructure exists.

## Config Expectations

Phase 4 should avoid config sprawl.

If configuration additions are needed, they should stay minimal and support only the baseline contract. Acceptable examples include:

- `LOG_LEVEL`
- a tracing mode or enable flag with a safe no-op default

Config additions should not imply vendor commitments or deployment wiring.

## Package And File Boundary Expectations

The implementation should introduce focused files instead of one large observability utility module.

The expected shape is close to:

```text
packages/observability/
  src/
    context.ts
    errors.ts
    ids.ts
    logger.ts
    problem-details.ts
    tracing.ts
    index.ts
```

`apps/api` should add focused adapter files for:

- request context construction
- Fastify error mapping
- request logging hooks

`apps/worker` should add focused files for:

- worker logger setup
- operation context creation
- structured status or startup logging

The exact filenames can vary slightly if repository patterns suggest a cleaner equivalent, but the boundaries must stay explicit.

## Testing

Verification for this phase should focus on baseline behavior rather than future telemetry depth.

Relevant proof points include:

- unit tests for ID validation and regeneration
- unit tests for context creation helpers
- unit tests for Problem Details helpers
- unit tests for safe error classification behavior
- unit tests for no-op tracing behavior
- API integration tests for sanitized request and correlation ID propagation
- API integration tests for sanitized `instance` values
- API integration tests for consistent Problem Details responses
- API integration tests for safe fallback 500 responses
- worker tests for baseline context generation
- worker tests for structured log output shape

The tests must prove that the baseline is real, consistent, and safe.

## Documentation

Phase 4 should add or update documentation for:

- the shared observability boundary
- log field conventions
- request and correlation ID handling rules
- Problem Details contract
- tracing hook non-goals
- explicit Phase 4 non-goals

The docs must make it clear that this phase establishes hooks and boundaries, not the full telemetry platform.

## Explicit Non-Goals

The following are explicitly out of scope for Phase 4:

- exporter deployment wiring
- provider rollout or deployment setup
- collector integration
- telemetry vendor integration
- dashboards
- alerts
- complete metrics platform rollout
- full error taxonomy design
- auth-aware, tenant-aware, or branch-aware context population beyond the reserved optional fields

## Acceptance Criteria

Phase 4 is acceptable when:

- `@vision/observability` is a real package with shared context, ID, logger, problem, error, and tracing helpers
- API requests produce structured completion logs with required request and correlation IDs
- API request and correlation IDs are validated and regenerated when unsafe
- API responses return sanitized request and correlation IDs in headers
- API failures return a consistent lightweight Problem Details-style payload
- `instance` is a sanitized request path without query strings
- fallback 500 responses are safe and consistent
- worker startup and operation logs are structured and use the shared context contract
- tracing hooks exist with a default no-op implementation
- tests cover the baseline behavior for API, worker, and shared helpers
- docs explain the contract and the non-goals
- no telemetry platform deployment work is introduced prematurely

## Implementation Order

Implementation should proceed in this order:

1. add failing tests for shared observability helpers
2. implement shared ID, context, logger, problem, error, and tracing utilities in `@vision/observability`
3. add failing API tests for request ID propagation, sanitized error payloads, and fallback 500 behavior
4. implement Fastify request context and error adapter files in `apps/api`
5. add failing worker tests for context generation and structured logging
6. implement worker observability adapters using the shared package
7. add or adjust minimal config only if needed for baseline coherence
8. update docs
9. run typecheck, lint, and tests
10. commit the Phase 4 observability baseline

## Open Decisions

No open design decisions remain for this slice.

The approved implementation target is a transport-agnostic shared observability package with thin API and worker adapters, lightweight Problem Details-style errors, validated request and correlation IDs, optional trace IDs through no-op tracing hooks, and explicit non-goals that defer real telemetry platform integration to a later hardening phase.
