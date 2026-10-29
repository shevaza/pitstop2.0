-- Run after user_module_access.sql. All access goes through the authenticated Next API.
begin;
-- Application-owned business roles are independent of directory sync and access permissions.
create table if not exists public.user_policy_roles (
  user_id text primary key,
  role text not null check (length(trim(role)) between 1 and 100)
);
alter table public.user_policy_roles enable row level security;
revoke all on public.user_policy_roles from public, anon, authenticated;
grant select, insert, update, delete on public.user_policy_roles to service_role;
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

-- Existing policies remain company-wide (a null recipient list).
alter table public.policies add column if not exists target_departments text[] not null default '{}';
alter table public.policies add column if not exists target_users text[] not null default '{}';
alter table public.policies add column if not exists recipient_upns text[];
alter table public.policy_revisions add column if not exists target_departments text[] not null default '{}';
alter table public.policy_revisions add column if not exists target_users text[] not null default '{}';
alter table public.policy_revisions add column if not exists recipient_upns text[];
alter table public.policies add column if not exists target_roles text[] not null default '{}';
alter table public.policy_revisions add column if not exists target_roles text[] not null default '{}';
alter table public.policies add column if not exists target_employee_types text[] not null default '{}';
alter table public.policy_revisions add column if not exists target_employee_types text[] not null default '{}';
alter table public.policies add column if not exists attachment jsonb;
alter table public.policy_revisions add column if not exists attachment jsonb;
drop function if exists public.publish_policy(uuid, integer, text, text, text);
drop function if exists public.publish_policy(uuid, integer, text, text, text, integer, text[], text[], text[]);

drop function if exists public.publish_policy(uuid, integer, text, text, text, integer, text[], text[], text[], jsonb);

drop function if exists public.publish_policy(uuid, integer, text, text, text, integer, text[], text[], text[], jsonb, text[]);

-- Publication and the immutable revision are committed together. Stale edits fail.
create or replace function public.publish_policy(p_id uuid, p_version integer, p_title text, p_body text, p_actor text, p_new_version integer, p_departments text[], p_users text[], p_recipients text[], p_attachment jsonb default null, p_employee_types text[] default '{}', p_roles text[] default '{}')
returns public.policies language plpgsql security invoker set search_path = '' as $$
declare result public.policies;
begin
  if p_employee_types is null or not (p_employee_types <@ array['Employee', 'Project Based', 'Intern']::text[]) or array_position(p_employee_types, null) is not null then
    raise sqlstate 'PT400' using message = 'Select valid employee types';
  end if;
  if p_new_version is null or p_new_version < 1 then
    raise sqlstate 'PT400' using message = 'Enter a positive whole-number version';
  end if;
  if (cardinality(p_departments) > 0 or cardinality(p_users) > 0 or cardinality(p_employee_types) > 0 or cardinality(p_roles) > 0) and coalesce(cardinality(p_recipients), 0) = 0 then
    raise sqlstate 'PT400' using message = 'Audience has no users';
  end if;
  if p_id is null then
    insert into public.policies(title, body, updated_by_upn, version, target_departments, target_users, recipient_upns, attachment, target_employee_types, target_roles)
    values (p_title, p_body, lower(trim(p_actor)), p_new_version, p_departments, p_users, p_recipients, p_attachment, p_employee_types, p_roles) returning * into result;
  else
    select * into result from public.policies where id = p_id for update;
    if not found then raise sqlstate 'PT404' using message = 'Policy not found'; end if;
    if p_version is distinct from result.version then
      raise sqlstate 'PT409' using message = 'Policy changed. Reload before editing.';
    end if;
    if p_new_version <= result.version then
      raise sqlstate 'PT400' using message = 'Version must be greater than the current version';
    end if;
    update public.policies set title = p_title, body = p_body, version = p_new_version,
      target_roles = p_roles, target_employee_types = p_employee_types, attachment = coalesce(p_attachment, result.attachment), target_departments = p_departments, target_users = p_users, recipient_upns = p_recipients,
      updated_by_upn = lower(trim(p_actor)), updated_at = now()
    where id = p_id returning * into result;
  end if;
  insert into public.policy_revisions(policy_id, version, title, body, published_by_upn, published_at, target_departments, target_users, recipient_upns, attachment, target_employee_types, target_roles)
  values (result.id, result.version, result.title, result.body, result.updated_by_upn, result.updated_at, result.target_departments, result.target_users, result.recipient_upns, result.attachment, result.target_employee_types, result.target_roles);
  return result;
end;
$$;

-- Lock against concurrent publication: acknowledgement always names the version read.
create or replace function public.acknowledge_policy(p_id uuid, p_version integer, p_actor text)
returns void language plpgsql security invoker set search_path = '' as $$
declare current_version integer; recipients text[];
begin
  select version, recipient_upns into current_version, recipients from public.policies where id = p_id for share;
  if not found then raise sqlstate 'PT404' using message = 'Policy not found'; end if;
  if p_version is distinct from current_version then
    raise sqlstate 'PT409' using message = 'Policy updated. Read the latest version before acknowledging.';
  end if;
  if recipients is not null and not (lower(trim(p_actor)) = any(recipients)) then
    raise sqlstate 'PT403' using message = 'Policy is not assigned to you';
  end if;
  insert into public.policy_acknowledgements(policy_id, version, user_upn)
  values (p_id, p_version, lower(trim(p_actor))) on conflict do nothing;
end;
$$;
revoke all on function public.publish_policy(uuid, integer, text, text, text, integer, text[], text[], text[], jsonb, text[], text[]) from public, anon, authenticated;
revoke all on function public.acknowledge_policy(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.publish_policy(uuid, integer, text, text, text, integer, text[], text[], text[], jsonb, text[], text[]) to service_role;
grant execute on function public.acknowledge_policy(uuid, integer, text) to service_role;
commit;
