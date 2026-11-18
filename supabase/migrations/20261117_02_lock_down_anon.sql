-- ============================================================
-- Family board — migration 02 (BREAKING: closes the public database)
--
-- Run only after:
--   1. migration 01 has run,
--   2. your emails are in app_members and you can sign in to the NEW
--      deploy (the one with the sign-in screen), and see your data.
--
-- What it does: removes every policy that lets the anon role (= anyone
-- holding the publishable key, i.e. anyone who loads the site) read or
-- write, and revokes anon's table privileges as a second lock. After
-- this the only things anon can do are sign in and call board_snapshot()
-- with a valid TV device token. Signed-in family members keep full
-- access through the family_members policies made in migration 01.
-- The service-role key (box sync, /api/mcp) bypasses RLS as before.
--
-- Rollback (re-opens the database to the world — emergency only):
--   create policy <table>_all on <table> for all to anon, authenticated
--     using (true) with check (true);
--   grant select, insert, update, delete on <table> to anon;
-- ============================================================

-- 1. Drop every policy on a public table that applies to anon or PUBLIC.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (roles @> array['anon']::name[] or roles @> array['public']::name[])
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 2. RLS on for every table in public, including leftovers the app no
--    longer uses (e.g. the old chats table). A table with RLS and no
--    policy is reachable only with the service-role key.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- 3. Belt and braces: anon keeps no table privileges at all.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 4. Functions: anon may call board_snapshot() and nothing else of ours.
--    (Functions that belong to an extension are left alone.)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname <> 'board_snapshot'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from anon, public', f.sig);
  end loop;
end $$;
grant execute on function public.board_snapshot(text) to anon;
