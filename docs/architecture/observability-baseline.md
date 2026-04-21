# Observability Baseline

Phase 4 establishes a shared observability baseline before auth, tenancy, and domain behavior expand.

## Shared Package Boundary

`@vision/observability` owns:

- request and correlation ID validation and generation
- shared observability context types
- child logger creation and structured JSON output
- Problem Details payload types and helpers
- baseline problem/error helpers
- tracing hook types and the default no-op tracer

## API Boundary

`apps/api` owns:

- reading `x-request-id` and `x-correlation-id`
- regenerating unsafe incoming values
- attaching request-scoped context
- returning sanitized IDs in response headers
- mapping framework and application errors to Problem Details responses

## Worker Boundary

`apps/worker` owns:

- creating non-HTTP operation context
- structured startup logs
- structured idle or operation logs

## Required Context Fields

Every baseline context includes:

- `requestId`
- `correlationId`

`traceId` is optional and comes from the tracing hook only when available.

Reserved optional fields for later phases include:

- `subject`
- `tenant`
- `branch`
- `service`
- `environment`

## Explicit Non-Goals

Phase 4 does not add:

- exporter deployment wiring
- provider rollout setup
- collector integration
- dashboards
- alerts
- telemetry vendor-specific configuration
