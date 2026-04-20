# ADR 0001: Modular Monolith

Status: Accepted

## Context

Vision needs strong consistency, central security logic, and fast iteration.

## Decision

Build Vision as a modular monolith with one backend API, one worker, separate frontend apps, and strict internal boundaries.

## Consequences

The project avoids microservice complexity during the foundation and early product phases. Module boundaries must be enforced by structure, reviews, and tests.
