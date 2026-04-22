# Module Boundaries

Vision is built as a modular monolith.

Application boundaries:

- `apps/web` owns the public booking and customer account surface.
- `apps/erp` owns tenant internal operations.
- `apps/platform` owns platform administration.
- `apps/api` owns backend HTTP routes.
- `apps/worker` owns asynchronous jobs.

Package boundaries:

- Shared packages expose reusable primitives only.
- `packages/tenancy` owns trusted ERP execution-context resolution.
- `packages/db` may apply trusted DB access context, but must not become a policy engine.
- Apps must not import from other apps.
- Backend route handlers must not become business logic containers.
- Product workflows must be implemented in the proper roadmap phase.
