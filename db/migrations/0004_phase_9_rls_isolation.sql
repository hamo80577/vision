create schema if not exists "vision";

create table if not exists "public"."tenant_rls_probes" (
	"id" varchar(64) primary key not null,
	"tenant_id" varchar(64) not null,
	"probe_key" varchar(128) not null,
	"probe_value" text not null,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null
);
--> statement-breakpoint
create index if not exists "tenant_rls_probes_tenant_idx" on "public"."tenant_rls_probes" using btree ("tenant_id");
--> statement-breakpoint
create unique index if not exists "tenant_rls_probes_tenant_key_key" on "public"."tenant_rls_probes" using btree ("tenant_id","probe_key");
--> statement-breakpoint
create or replace function vision.require_tenant_id()
returns varchar(64)
language plpgsql
stable
as $$
declare
  tenant_value text;
begin
  tenant_value := nullif(btrim(current_setting('vision.tenant_id', true)), '');

  if tenant_value is null or char_length(tenant_value) > 64 then
    raise exception 'vision.tenant_id is required'
      using errcode = '42501';
  end if;

  return tenant_value::varchar(64);
end;
$$;
--> statement-breakpoint
revoke all on function vision.require_tenant_id() from public;
--> statement-breakpoint
alter table "public"."tenant_rls_probes" enable row level security;
--> statement-breakpoint
alter table "public"."tenant_rls_probes" force row level security;
--> statement-breakpoint
drop policy if exists tenant_rls_probes_select on "public"."tenant_rls_probes";
--> statement-breakpoint
create policy tenant_rls_probes_select on "public"."tenant_rls_probes"
for select
using (tenant_id = vision.require_tenant_id());
--> statement-breakpoint
drop policy if exists tenant_rls_probes_insert on "public"."tenant_rls_probes";
--> statement-breakpoint
create policy tenant_rls_probes_insert on "public"."tenant_rls_probes"
for insert
with check (tenant_id = vision.require_tenant_id());
--> statement-breakpoint
drop policy if exists tenant_rls_probes_update on "public"."tenant_rls_probes";
--> statement-breakpoint
create policy tenant_rls_probes_update on "public"."tenant_rls_probes"
for update
using (tenant_id = vision.require_tenant_id())
with check (tenant_id = vision.require_tenant_id());
--> statement-breakpoint
drop policy if exists tenant_rls_probes_delete on "public"."tenant_rls_probes";
--> statement-breakpoint
create policy tenant_rls_probes_delete on "public"."tenant_rls_probes"
for delete
using (tenant_id = vision.require_tenant_id());
