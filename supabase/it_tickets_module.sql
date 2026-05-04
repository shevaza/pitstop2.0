create extension if not exists pgcrypto;

create table if not exists public.it_tickets (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text not null,
    category text,
    priority text not null default 'medium',
    status text not null default 'open',
    requester_upn text not null,
    requester_name text,
    assigned_to_upn text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    closed_at timestamptz
);

create table if not exists public.it_ticket_comments (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references public.it_tickets(id) on delete cascade,
    author_upn text not null,
    author_name text,
    visibility text not null default 'public',
    body text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.it_ticket_attachments (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references public.it_tickets(id) on delete cascade,
    comment_id uuid references public.it_ticket_comments(id) on delete cascade,
    uploader_upn text not null,
    uploader_name text,
    file_name text not null,
    mime_type text not null,
    data_url text not null,
    created_at timestamptz not null default now()
);

alter table if exists public.it_tickets add column if not exists category text;
alter table if exists public.it_tickets add column if not exists priority text not null default 'medium';
alter table if exists public.it_tickets add column if not exists status text not null default 'open';
alter table if exists public.it_tickets add column if not exists assigned_to_upn text;
alter table if exists public.it_tickets add column if not exists closed_at timestamptz;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists it_tickets_set_updated_at on public.it_tickets;
create trigger it_tickets_set_updated_at
before update on public.it_tickets
for each row
execute function public.set_updated_at();

alter table public.it_tickets enable row level security;
alter table public.it_ticket_comments enable row level security;
alter table public.it_ticket_attachments enable row level security;

drop policy if exists "service role manages it tickets" on public.it_tickets;
create policy "service role manages it tickets"
on public.it_tickets
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "service role manages it ticket comments" on public.it_ticket_comments;
create policy "service role manages it ticket comments"
on public.it_ticket_comments
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "service role manages it ticket attachments" on public.it_ticket_attachments;
create policy "service role manages it ticket attachments"
on public.it_ticket_attachments
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
