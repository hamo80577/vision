# ADR 0004: Centralized Authorization and Row-Level Security

Status: Accepted

## Context

Vision is multi-tenant and must not rely on UI visibility or scattered role checks.

## Decision

Authorization will be centralized in `packages/authz`, and critical tenant-scoped tables will use PostgreSQL row-level security in later phases.

## Consequences

Phase 1 creates package boundaries only. Real authorization, tenancy context, and RLS are implemented in their roadmap phases with tests.
