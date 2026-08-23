-- ============================================================
-- Martin's Life Dashboard — schema
-- Run this once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: everything is IF NOT EXISTS / OR REPLACE.
-- ============================================================

create extension if not exists "pgcrypto";

-- ── DOMAINS ────────────────────────────────────────────────
create table if not exists domains (
  id          text primary key,          -- 'health', 'career', …
  name        text not null,
  emoji       text,
  color       text,
  score       integer default 5 check (score between 1 and 10),
  sort_order  integer default 0
);

-- ── FOLDERS (infinitely nestable) ──────────────────────────
create table if not exists folders (
  id                uuid primary key default gen_random_uuid(),
  domain_id         text not null references domains(id) on delete cascade,
  parent_folder_id  uuid references folders(id) on delete cascade,
  name              text not null,
  sort_order        integer default 0,
  created_at        timestamptz default now()
);
create index if not exists folders_domain_idx on folders(domain_id);
create index if not exists folders_parent_idx on folders(parent_folder_id);

-- ── ITEMS (typed; actions nest under goals) ────────────────
create table if not exists items (
  id              uuid primary key default gen_random_uuid(),
  folder_id       uuid not null references folders(id) on delete cascade,
  type            text not null check (type in ('goal','task','action','consideration','research')),
  text            text not null,
  done            boolean default false,
  parent_item_id  uuid references items(id) on delete cascade,
  sort_order      integer default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists items_folder_idx on items(folder_id);
create index if not exists items_parent_idx on items(parent_item_id);

-- an action must have a parent goal; nothing else may have a parent
alter table items drop constraint if exists items_action_nesting;
alter table items add constraint items_action_nesting check (
  (type = 'action' and parent_item_id is not null)
  or (type <> 'action' and parent_item_id is null)
);

create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists items_touch on items;
create trigger items_touch before update on items
  for each row execute function touch_updated_at();

-- ── PEOPLE (Family domain) ─────────────────────────────────
create table if not exists people (
  id                text primary key,     -- 'me', 'partner', …
  name              text not null,
  role              text,
  rel               text,
  emoji             text,
  color             text,
  parent_person_id  text references people(id) on delete set null,
  sort_order        integer default 0
);

-- ── CHATS / NOTES ──────────────────────────────────────────
-- domain_id + person_id + folder_id all null  ⇒  the global Pending inbox.
create table if not exists chats (
  id          uuid primary key default gen_random_uuid(),
  domain_id   text references domains(id) on delete cascade,
  folder_id   uuid references folders(id) on delete cascade,
  person_id   text references people(id) on delete cascade,
  title       text not null,
  url         text,
  meta        text,
  created_at  timestamptz default now()
);
create index if not exists chats_domain_idx on chats(domain_id);
create index if not exists chats_folder_idx on chats(folder_id);
create index if not exists chats_person_idx on chats(person_id);

-- ── SINGLE-USER ACCESS ─────────────────────────────────────
-- Martin is the only user. RLS is on, with a blanket policy for the
-- anon key. If you ever add a second user, replace these policies.
alter table domains enable row level security;
alter table folders enable row level security;
alter table items   enable row level security;
alter table people  enable row level security;
alter table chats   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['domains','folders','items','people','chats'] loop
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      t || '_all', t);
  end loop;
end $$;

-- ── REALTIME ───────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['domains','folders','items','people','chats'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
