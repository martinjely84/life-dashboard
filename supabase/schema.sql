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
  type            text not null check (type in ('goal','action','task','research')),
  text            text not null,
  done            boolean default false,
  parent_item_id  uuid references items(id) on delete cascade,
  sort_order      integer default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists items_folder_idx on items(folder_id);
create index if not exists items_parent_idx on items(parent_item_id);

-- a goal sits at folder level; every other type hangs beneath a goal
alter table items drop constraint if exists items_action_nesting;
alter table items drop constraint if exists items_nesting;
alter table items add constraint items_nesting check (
  (type = 'goal' and parent_item_id is null)
  or (type <> 'goal' and parent_item_id is not null)
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

-- ── SINGLE-USER ACCESS ─────────────────────────────────────
-- Martin is the only user. RLS is on, with a blanket policy for the
-- anon key. If you ever add a second user, replace these policies.
alter table domains enable row level security;
alter table folders enable row level security;
alter table items   enable row level security;
alter table people  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['domains','folders','items','people'] loop
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
  foreach t in array array['domains','folders','items','people'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
-- ── TO-DO LIST & DAILY HABITS ──────────────────────────────
create table if not exists todos (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  done        boolean default false,
  sort_order  integer default 0,
  created_at  timestamptz default now()
);

-- last_done holds the date the habit was last ticked, so the checkbox
-- clears itself each new day while the streak survives.
create table if not exists habits (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  last_done   date,
  streak      integer default 0,
  sort_order  integer default 0,
  created_at  timestamptz default now()
);

alter table todos  enable row level security;
alter table habits enable row level security;

do $$
declare t text;
begin
  foreach t in array array['todos','habits'] loop
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      t || '_all', t);
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
-- Habits gain a cadence: daily, weekly or monthly.
alter table habits add column if not exists cadence text not null default 'daily';
alter table habits drop constraint if exists habits_cadence_check;
alter table habits add constraint habits_cadence_check
  check (cadence in ('daily','weekly','monthly'));
-- ── NOTES / UPDATES ────────────────────────────────────────
-- A running log against an item, newest first.
create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  text        text not null,
  created_at  timestamptz default now()
);
create index if not exists notes_item_idx on notes(item_id);

alter table notes enable row level security;

do $$
begin
  execute 'drop policy if exists notes_all on notes';
  execute 'create policy notes_all on notes for all to anon, authenticated using (true) with check (true)';
  begin
    execute 'alter publication supabase_realtime add table notes';
  exception when duplicate_object then null;
  end;
end $$;
