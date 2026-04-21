# Logging And Error Safety

Phase 4 introduces structured logs and a lightweight Problem Details response model. This baseline must stay safe by default.

## Log Safety Rules

- Do not log secrets.
- Do not log passwords.
- Do not log raw MFA material.
- Do not log challenge tokens.
- Do not log raw backup codes.
- Do not dump full exception objects into default logs.
- Do not log unnecessary PII.

Structured error serialization should keep only the minimum safe fields needed for debugging, such as error name, message, stable code, and status when available.

## Client Error Payload Rules

Problem Details responses may include:

- `type`
- `title`
- `status`
- `detail`
- `instance`
- stable `code`
- optional `traceId`
- optional `errors` for validation failures

Problem Details responses must not include:

- stack traces
- raw exceptions
- secrets
- full URLs with query strings
- unnecessary PII

## Instance Rules

`instance` must be a sanitized request path only. Query strings and full URLs must not be echoed back to clients.

## Header Rules

Incoming `x-request-id` and `x-correlation-id` values must be validated. Unsafe values must be replaced with sanitized generated values before they are stored in context or returned in response headers.
