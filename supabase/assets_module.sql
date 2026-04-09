create extension if not exists pgcrypto;

create table if not exists public.asset_users (
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
    source text not null default 'asset-module',
    last_synced_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.assets (
    id uuid primary key default gen_random_uuid(),
    asset_tag text not null unique,
    name text not null,
    asset_group text,
    asset_type text not null,
    status text not null default 'active',
    serial_number text,
    manufacturer text,
    model text,
    notes text,
    assigned_user_id uuid references public.asset_users(id) on delete set null,
    created_by_upn text not null,
    updated_by_upn text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table if exists public.assets add column if not exists asset_group text;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists asset_users_set_updated_at on public.asset_users;
create trigger asset_users_set_updated_at
before update on public.asset_users
for each row
execute function public.set_updated_at();

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
before update on public.assets
for each row
execute function public.set_updated_at();

alter table public.asset_users enable row level security;
alter table public.assets enable row level security;

drop policy if exists "service role manages asset users" on public.asset_users;
create policy "service role manages asset users"
on public.asset_users
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "service role manages assets" on public.assets;
create policy "service role manages assets"
on public.assets
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
