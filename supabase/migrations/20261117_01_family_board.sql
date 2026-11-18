-- ============================================================
-- Family board — migration 01 (additive)
--
-- Adds what the family board (/board on phone + laptop, /tv on the TV)
-- needs, on top of supabase/schema.sql:
--   • todos: due dates, owner, soft-archive, box-sync bookkeeping
--   • people: aliases (extra words that mean this person in event titles)
--   • calendar_sources / calendar_events, mirrored from the box
--   • weekly review: review_weeks, review_cards, review_session
--   • app_members: the email allowlist (the two parents)
--   • board_devices: revocable read-only links for TV browsers
--   • functions: is_family_member, board_events, board_snapshot,
--     create_board_device, revoke_board_device, review_control
--
-- Additive only: nothing is dropped or renamed, and the old blanket
-- anon policies stay until migration 02, so the current deploy keeps
-- working after this runs. Every NEW table is members-only from the
-- start (no anon policy). Safe to re-run.
-- ============================================================

create extension if not exists pgcrypto;

-- ── ALLOWLIST ──────────────────────────────────────────────
-- Who may sign in and see the data. Managed from the SQL editor only
-- (RLS on, no policies → invisible to the API).
create table if not exists app_members (
  email       text primary key check (email = lower(email)),
  name        text,
  created_at  timestamptz not null default now()
);
alter table app_members enable row level security;

-- True when the caller is a signed-in user whose CONFIRMED email is on
-- the allowlist. Reads auth.users rather than trusting the JWT claim, so
-- an unconfirmed sign-up can't borrow a family email.
create or replace function public.is_family_member()
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.app_members m on m.email = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  )
$$;
revoke all on function public.is_family_member() from public;
grant execute on function public.is_family_member() to authenticated;

-- ── TODOS ──────────────────────────────────────────────────
alter table todos add column if not exists due_date    date;         -- America/Chicago calendar date
alter table todos add column if not exists owner       text;         -- a person id or a bot name
alter table todos add column if not exists updated_by  text;
alter table todos add column if not exists archived_at timestamptz;  -- soft delete; hidden everywhere
alter table todos add column if not exists updated_at  timestamptz default now();
alter table todos add column if not exists source      text;         -- null = made in this app; 'box' = synced
-- Values the box sync last pushed for this row. The sync only overwrites
-- a field the box changed since then, so a tick made on the phone sticks.
alter table todos add column if not exists sync_base   jsonb;

drop trigger if exists todos_touch on todos;
create trigger todos_touch before update on todos
  for each row execute function touch_updated_at();

-- ── PEOPLE ─────────────────────────────────────────────────
-- Event titles and to-dos are coloured by the person they name. The
-- person's first name always matches; aliases add nicknames/misspellings.
alter table people add column if not exists aliases text[] not null default '{}';

-- ── CALENDAR (mirrored from the box by scripts/sync-box) ───
create table if not exists calendar_sources (
  id              text primary key,          -- 'family', 'work', …
  name            text not null,
  last_synced_at  timestamptz,               -- last time the BOX pulled the feed
  last_status     text,                      -- 'ok' | 'error'
  last_error      text,                      -- URLs redacted by the sync
  archived_at     timestamptz,
  updated_at      timestamptz default now()
);

-- Timed and all-day events are stored differently on purpose: an all-day
-- event is a pair of calendar DATES, never an instant. (Storing '2026-11-20'
-- as a timestamp makes it midnight UTC = 6 PM the day before in Chicago.)
create table if not exists calendar_events (
  id             text primary key,           -- the box's id
  source_id      text not null references calendar_sources(id) on delete cascade,
  uid            text,                       -- ICS UID (for de-duplication across feeds)
  recurrence_id  text not null default '',
  summary        text,
  location       text,
  all_day        boolean not null default false,
  starts_at      timestamptz,                -- timed events only
  ends_at        timestamptz,
  start_date     date,                       -- all-day events only
  end_date       date,                       -- exclusive, like ICS DTEND
  status         text not null default 'confirmed'
                   check (status in ('confirmed','tentative','cancelled')),
  archived_at    timestamptz,
  synced_at      timestamptz not null default now(),
  constraint calendar_events_shape check (
    (all_day and start_date is not null and end_date is not null and end_date > start_date
             and starts_at is null and ends_at is null)
    or (not all_day and starts_at is not null and start_date is null and end_date is null
             and (ends_at is null or ends_at >= starts_at))
  )
);
create index if not exists calendar_events_starts_idx on calendar_events(starts_at) where not all_day;
create index if not exists calendar_events_dates_idx  on calendar_events(start_date, end_date) where all_day;
create index if not exists calendar_events_source_idx on calendar_events(source_id);

-- ── WEEKLY REVIEW ──────────────────────────────────────────
-- One row per ISO week (America/Chicago), e.g. '2026-W47'.
create table if not exists review_weeks (
  id          text primary key check (id ~ '^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$'),
  theme       text,
  updated_at  timestamptz default now()
);

create table if not exists review_cards (
  id          uuid primary key default gen_random_uuid(),
  week        text not null check (week ~ '^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$'),
  kind        text not null check (kind in ('win','decision','parked')),
  text        text not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists review_cards_week_idx on review_cards(week);

-- The shared step timer: exactly one row. idle = started_at and paused_at
-- null; running = started_at set; paused = paused_at set.
-- elapsed = elapsed_before_pause_ms (+ now − started_at while running).
create table if not exists review_session (
  id                      integer primary key default 1 check (id = 1),
  step                    integer not null default 1 check (step between 1 and 7),
  started_at              timestamptz,
  paused_at               timestamptz,
  elapsed_before_pause_ms bigint not null default 0,
  updated_at              timestamptz default now()
);
insert into review_session (id) values (1) on conflict (id) do nothing;

-- ── TV DEVICE LINKS ────────────────────────────────────────
-- A TV opens /tv#k=<token>. Only a SHA-256 of the token is stored; the
-- token itself is shown once, when the link is made. Revoke = set
-- revoked_at (or delete the row).
create table if not exists board_devices (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  created_by    text,
  last_seen_at  timestamptz,
  revoked_at    timestamptz
);

-- ── RLS: family members only ───────────────────────────────
-- New tables get only this policy. The existing tables get it too, next
-- to their old blanket anon policies (policies OR together, so nothing
-- changes for the current deploy until migration 02 drops those).
do $$
declare t text;
begin
  foreach t in array array[
    'domains','folders','items','people','todos','habits','notes',
    'calendar_sources','calendar_events',
    'review_weeks','review_cards','review_session'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists family_members on %I', t);
    execute format(
      'create policy family_members on %I for all to authenticated '
      'using ((select public.is_family_member())) with check ((select public.is_family_member()))', t);
  end loop;
end $$;

-- Devices: members can list them; making and revoking go through the
-- functions below so the token never touches a table in clear.
alter table board_devices enable row level security;
drop policy if exists family_members_read on board_devices;
create policy family_members_read on board_devices for select to authenticated
  using ((select public.is_family_member()));

-- ── REALTIME (signed-in phones/laptops) ────────────────────
do $$
declare t text;
begin
  foreach t in array array['calendar_events','review_weeks','review_cards','review_session'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object or undefined_object then null;
    end;
  end loop;
end $$;

-- ── FUNCTIONS ──────────────────────────────────────────────

-- Events overlapping the Chicago dates [p_from, p_from + p_days).
-- Timed events by instant, all-day events by date. SECURITY INVOKER, so a
-- signed-in caller only sees what RLS lets them.
create or replace function public.board_events(p_from date, p_days integer default 7)
returns table (
  id text, source_id text, source_name text, uid text, summary text, location text,
  all_day boolean, starts_at timestamptz, ends_at timestamptz,
  start_date date, end_date date, status text
)
language sql stable security invoker
set search_path = public
as $$
  with w as (
    select p_from as d0,
           p_from + least(greatest(coalesce(p_days, 7), 1), 42) as d1
  )
  select e.id, e.source_id, s.name, e.uid, e.summary, e.location,
         e.all_day, e.starts_at, e.ends_at, e.start_date, e.end_date, e.status
  from calendar_events e
  join calendar_sources s on s.id = e.source_id
  cross join w
  where e.archived_at is null
    and s.archived_at is null
    and e.status <> 'cancelled'
    and (
      (e.all_day and e.start_date < w.d1 and e.end_date > w.d0)
      or (not e.all_day
          and e.starts_at < (w.d1::timestamp at time zone 'America/Chicago')
          and coalesce(e.ends_at, e.starts_at) > (w.d0::timestamp at time zone 'America/Chicago'))
    )
  order by coalesce(e.starts_at, e.start_date::timestamp at time zone 'America/Chicago'),
           e.all_day desc, e.id
$$;
revoke all on function public.board_events(date, integer) from public;
grant execute on function public.board_events(date, integer) to authenticated;

-- Make a TV link. Returns the token ONCE; only its hash is kept.
create or replace function public.create_board_device(p_label text)
returns text
language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare
  tok text;
begin
  if not public.is_family_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(btrim(p_label), '') = '' then
    raise exception 'give the screen a name' using errcode = '22023';
  end if;
  -- 32 random bytes, base64url without padding: 43 characters.
  tok := translate(encode(gen_random_bytes(32), 'base64'), E'+/=\n', '-_');
  insert into board_devices (label, token_hash, created_by)
  values (left(btrim(p_label), 80), encode(sha256(convert_to(tok, 'UTF8')), 'hex'),
          (select email from auth.users where id = auth.uid()));
  return tok;
end
$$;
revoke all on function public.create_board_device(text) from public;
grant execute on function public.create_board_device(text) to authenticated;

create or replace function public.revoke_board_device(p_id uuid)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if not public.is_family_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update board_devices set revoked_at = now() where id = p_id and revoked_at is null;
end
$$;
revoke all on function public.revoke_board_device(uuid) from public;
grant execute on function public.revoke_board_device(uuid) to authenticated;

-- Everything the TV shows, for a valid device token. This is the ONLY
-- thing the anon role can call. Read-only apart from bumping last_seen_at.
-- Returns open items only, and no notes, habits, descriptions or feed URLs.
create or replace function public.board_snapshot(p_token text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare
  dev   board_devices;
  today date := (now() at time zone 'America/Chicago')::date;
  wk    text := to_char((now() at time zone 'America/Chicago')::date, 'IYYY"-W"IW');
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 then
    raise exception 'invalid device link' using errcode = '28000';
  end if;
  select * into dev from board_devices
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and revoked_at is null;
  if not found then
    raise exception 'invalid device link' using errcode = '28000';
  end if;
  if dev.last_seen_at is null or dev.last_seen_at < now() - interval '5 minutes' then
    update board_devices set last_seen_at = now() where id = dev.id;
  end if;

  return jsonb_build_object(
    'server_now', now(),
    'today', today,
    'device', dev.label,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color,
                                          'sort_order', p.sort_order, 'aliases', p.aliases)
                       order by p.sort_order, p.id)
      from people p), '[]'::jsonb),
    'domains', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'emoji', d.emoji,
                                          'color', d.color, 'sort_order', d.sort_order))
      from domains d), '[]'::jsonb),
    'folders', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'domain_id', f.domain_id, 'name', f.name))
      from folders f), '[]'::jsonb),
    -- Open goals/actions, plus the ids of done ones (to hide actions under a done goal).
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'folder_id', i.folder_id, 'type', i.type,
                                          'text', case when i.done then null else i.text end,
                                          'done', i.done, 'parent_item_id', i.parent_item_id,
                                          'sort_order', i.sort_order, 'created_at', i.created_at))
      from items i), '[]'::jsonb),
    'todos', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'text', t.text, 'done', t.done,
                                          'due_date', t.due_date, 'owner', t.owner,
                                          'sort_order', t.sort_order, 'created_at', t.created_at))
      from todos t where not coalesce(t.done, false) and t.archived_at is null), '[]'::jsonb),
    -- One day either side of the week, so the browser can never miss an edge.
    'events', coalesce((
      select jsonb_agg(to_jsonb(e)) from public.board_events(today - 1, 9) e), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'last_status', s.last_status,
                                          'last_synced_at', s.last_synced_at))
      from calendar_sources s where s.archived_at is null), '[]'::jsonb),
    'review', jsonb_build_object(
      'week', wk,
      'theme', (select theme from review_weeks where id = wk),
      'cards', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'text', c.text, 'done', c.done,
                                            'created_at', c.created_at) order by c.created_at)
        from review_cards c where c.week = wk and c.archived_at is null), '[]'::jsonb),
      'session', (select to_jsonb(r) from review_session r where r.id = 1)
    )
  );
end
$$;
revoke all on function public.board_snapshot(text) from public;
grant execute on function public.board_snapshot(text) to anon, authenticated;

-- Review timer buttons. Uses the database clock so every screen agrees.
-- SECURITY INVOKER: RLS on review_session limits it to family members.
create or replace function public.review_control(p_action text)
returns jsonb
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  r       review_session;
  running boolean;
  ran_ms  bigint;
begin
  select * into r from review_session where id = 1 for update;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  running := r.started_at is not null and r.paused_at is null;
  ran_ms := case when running
                 then r.elapsed_before_pause_ms + (extract(epoch from now() - r.started_at) * 1000)::bigint
                 else r.elapsed_before_pause_ms end;

  if p_action in ('start', 'resume') then
    if not running then
      update review_session set started_at = now(), paused_at = null, updated_at = now() where id = 1;
    end if;
  elsif p_action = 'pause' then
    if running then
      update review_session set elapsed_before_pause_ms = ran_ms, started_at = null,
             paused_at = now(), updated_at = now() where id = 1;
    end if;
  elsif p_action in ('next', 'back') then
    -- New step starts from zero; keeps running if it was running.
    update review_session
       set step = least(7, greatest(1, r.step + case when p_action = 'next' then 1 else -1 end)),
           elapsed_before_pause_ms = 0,
           started_at = case when running then now() end,
           paused_at = null,
           updated_at = now()
     where id = 1;
  elsif p_action = 'reset' then
    update review_session set step = 1, elapsed_before_pause_ms = 0, started_at = null,
           paused_at = null, updated_at = now() where id = 1;
  else
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;

  select * into r from review_session where id = 1;
  return to_jsonb(r) || jsonb_build_object('server_now', now());
end
$$;
revoke all on function public.review_control(text) from public;
grant execute on function public.review_control(text) to authenticated;
