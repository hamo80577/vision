# ADR 0003: TypeScript, Next.js, Fastify, and PostgreSQL

Status: Accepted

## Context

Vision needs typed full-stack development, public SSR capability, controlled backend behavior, and transactional persistence.

## Decision

Use TypeScript, Next.js for frontend apps, Fastify for the API, and PostgreSQL for production persistence.

## Consequences

The initial skeleton must prepare these boundaries without implementing later database or domain phases early.
