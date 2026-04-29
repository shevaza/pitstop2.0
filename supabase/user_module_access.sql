create extension if not exists pgcrypto;

create table if not exists public.user_module_access (
    id uuid primary key default gen_random_uuid(),
    user_principal_name text not null,
    display_name text,
    module_key text not null,
    allowed boolean not null default false,
    updated_by_upn text,
    updated_at timestamptz not null default now(),
    unique (user_principal_name, module_key)
);

alter table if exists public.user_module_access
add column if not exists asset_groups text[];

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists user_module_access_set_updated_at on public.user_module_access;
create trigger user_module_access_set_updated_at
before update on public.user_module_access
for each row
execute function public.set_updated_at();

alter table public.user_module_access enable row level security;

drop policy if exists "service role manages user module access" on public.user_module_access;
create policy "service role manages user module access"
on public.user_module_access
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
