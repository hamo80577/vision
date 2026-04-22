# Row Level Security

Phase 9 proves tenant isolation with a dedicated database surface: `tenant_rls_probes`.

## Proof Surface

`public.tenant_rls_probes` is the only Phase 9 table used to prove RLS behavior.

It is protected with:

- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY`

The table has explicit policies for:

- `SELECT`
- `INSERT`
- `UPDATE`
- `DELETE`

Each policy compares the row tenant id against `vision.require_tenant_id()`.

## Policy Input

The only Phase 9 policy input is `vision.tenant_id`.

## Tenant Helper

`vision.require_tenant_id()` is the guard used by the policies.

It:

- reads `current_setting('vision.tenant_id', true)`
- trims whitespace
- rejects missing or blank values
- rejects values longer than 64 characters
- returns `varchar(64)`

## Why A Dedicated Surface

`tenant_rls_probes` keeps the RLS proof isolated from product-domain tables.

That makes the contract easy to verify in tests and migrations:

- the runtime role must only see tenant-matching rows
- bootstrap and admin paths can still manage the schema
- the proof does not depend on an incidental business table
