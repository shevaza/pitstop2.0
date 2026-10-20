-- Run after user_module_access.sql. All access goes through the authenticated Next API.
begin;
create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null check (length(trim(body)) between 1 and 100000),
  version integer not null default 1 check (version > 0),
  updated_by_upn text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.policy_revisions (
  policy_id uuid not null references public.policies(id),
  version integer not null,
  title text not null,
  body text not null,
  published_by_upn text not null,
  published_at timestamptz not null default now(),
  primary key (policy_id, version)
);
create table if not exists public.policy_acknowledgements (
  policy_id uuid not null,
  version integer not null,
  user_upn text not null,
  acknowledged_at timestamptz not null default now(),
  primary key (policy_id, version, user_upn),
  foreign key (policy_id, version) references public.policy_revisions(policy_id, version)
);
create index if not exists policy_acknowledgements_user on public.policy_acknowledgements(user_upn);
alter table public.policies enable row level security;
alter table public.policy_revisions enable row level security;
alter table public.policy_acknowledgements enable row level security;
revoke all on public.policies, public.policy_revisions, public.policy_acknowledgements from anon, authenticated;
grant select, insert, update on public.policies to service_role;
grant select, insert on public.policy_revisions, public.policy_acknowledgements to service_role;

-- Publication and the immutable revision are committed together. Stale edits fail.
create or replace function public.publish_policy(p_id uuid, p_version integer, p_title text, p_body text, p_actor text)
returns public.policies language plpgsql security invoker set search_path = '' as $$
declare result public.policies;
begin
  if p_id is null then
    insert into public.policies(title, body, updated_by_upn)
    values (p_title, p_body, lower(trim(p_actor))) returning * into result;
  else
    select * into result from public.policies where id = p_id for update;
    if not found then raise sqlstate 'PT404' using message = 'Policy not found'; end if;
    if p_version is distinct from result.version then
      raise sqlstate 'PT409' using message = 'Policy changed. Reload before editing.';
    end if;
    update public.policies set title = p_title, body = p_body, version = version + 1,
      updated_by_upn = lower(trim(p_actor)), updated_at = now()
    where id = p_id returning * into result;
  end if;
  insert into public.policy_revisions(policy_id, version, title, body, published_by_upn, published_at)
  values (result.id, result.version, result.title, result.body, result.updated_by_upn, result.updated_at);
  return result;
end;
$$;

-- Lock against concurrent publication: acknowledgement always names the version read.
create or replace function public.acknowledge_policy(p_id uuid, p_version integer, p_actor text)
returns void language plpgsql security invoker set search_path = '' as $$
declare current_version integer;
begin
  select version into current_version from public.policies where id = p_id for share;
  if not found then raise sqlstate 'PT404' using message = 'Policy not found'; end if;
  if p_version is distinct from current_version then
    raise sqlstate 'PT409' using message = 'Policy updated. Read the latest version before acknowledging.';
  end if;
  insert into public.policy_acknowledgements(policy_id, version, user_upn)
  values (p_id, p_version, lower(trim(p_actor))) on conflict do nothing;
end;
$$;
revoke all on function public.publish_policy(uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.acknowledge_policy(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.publish_policy(uuid, integer, text, text, text) to service_role;
grant execute on function public.acknowledge_policy(uuid, integer, text) to service_role;
commit;
