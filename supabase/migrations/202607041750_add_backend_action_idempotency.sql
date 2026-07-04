create table if not exists app_private.idempotency_keys (
  uid text not null,
  action text not null,
  request_id text not null,
  status text not null default 'processing' check (status in ('processing', 'completed')),
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key (uid, action, request_id)
);

alter table app_private.idempotency_keys enable row level security;

create index if not exists idempotency_keys_expiry_idx
  on app_private.idempotency_keys (expires_at);

create or replace function app_api.claim_idempotency_key(
  actor_uid text,
  action_name text,
  request_id text
)
returns table(claimed boolean, completed boolean, response jsonb)
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  inserted boolean := false;
  existing_status text;
  existing_response jsonb;
begin
  if actor_uid is null
    or length(btrim(actor_uid)) = 0
    or action_name is null
    or length(btrim(action_name)) = 0
    or request_id is null
    or length(btrim(request_id)) = 0
    or length(request_id) > 120
  then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  insert into app_private.idempotency_keys (uid, action, request_id)
  values (actor_uid, action_name, request_id)
  on conflict do nothing
  returning true into inserted;

  if inserted then
    return query select true, false, null::jsonb;
    return;
  end if;

  select status, response
  into existing_status, existing_response
  from app_private.idempotency_keys
  where uid = actor_uid
    and action = action_name
    and idempotency_keys.request_id = claim_idempotency_key.request_id;

  return query select false, existing_status = 'completed', existing_response;
end;
$$;

create or replace function app_api.complete_idempotency_key(
  actor_uid text,
  action_name text,
  request_id text,
  action_response jsonb
)
returns void
language sql
security definer
set search_path = app_private, public
as $$
  update app_private.idempotency_keys
  set
    status = 'completed',
    response = action_response,
    updated_at = now(),
    expires_at = now() + interval '7 days'
  where uid = actor_uid
    and action = action_name
    and idempotency_keys.request_id = complete_idempotency_key.request_id
    and status = 'processing';
$$;

create or replace function app_api.release_idempotency_key(
  actor_uid text,
  action_name text,
  request_id text
)
returns void
language sql
security definer
set search_path = app_private, public
as $$
  delete from app_private.idempotency_keys
  where uid = actor_uid
    and action = action_name
    and idempotency_keys.request_id = release_idempotency_key.request_id
    and status = 'processing';
$$;

grant execute on function app_api.claim_idempotency_key(text, text, text) to service_role;
grant execute on function app_api.complete_idempotency_key(text, text, text, jsonb) to service_role;
grant execute on function app_api.release_idempotency_key(text, text, text) to service_role;
grant all privileges on app_private.idempotency_keys to service_role;
