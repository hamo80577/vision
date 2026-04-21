# Security

This folder contains security model notes for Vision.

Security decisions must preserve:

- tenant isolation
- centralized authorization
- database-backed sessions
- MFA and assurance levels for sensitive internal roles
- grant-based support access
- auditability for sensitive operations

Current implementation notes:

- [Authorization Engine](./authorization-engine.md)
- [Tenancy Execution Context](./tenancy-execution-context.md)
- [MFA And Assurance](./mfa-and-assurance.md)
- [Logging And Error Safety](./logging-and-error-safety.md)
- [Secrets Strategy](./secrets-strategy.md)

The full security target is defined in `Vision_Greenfield_Blueprint.md` and `agent.md`.
