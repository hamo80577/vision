# ADR 0002: Separate Trust Surface Apps

Status: Accepted

## Context

Vision has public customer, tenant ERP, and platform administration surfaces with different trust boundaries.

## Decision

Use three separate Next.js apps: `apps/web`, `apps/erp`, and `apps/platform`.

## Consequences

The public, tenant, and platform surfaces remain structurally separate. Shared UI must live in packages, not by importing between apps.
