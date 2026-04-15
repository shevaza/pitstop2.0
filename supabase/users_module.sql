create extension if not exists pgcrypto;

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    azure_user_id text unique,
    user_principal_name text not null unique,
    display_name text,
    given_name text,
    surname text,
    job_title text,
    department text,
    office_location text,
    mobile_phone text,
    employee_id text,
    employee_type text,
    usage_location text,
    account_enabled boolean,
    source text not null default 'azure',
    last_synced_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.set_users_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row
execute function public.set_users_updated_at();

alter table public.users enable row level security;

drop policy if exists "service role manages users cache" on public.users;
create policy "service role manages users cache"
on public.users
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
