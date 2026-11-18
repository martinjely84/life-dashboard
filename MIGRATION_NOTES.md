# Family board — what to apply, in order

This branch moves the box's "Command Centre" `/tv` board into this app and
closes the database to the public. **Nothing here has been applied to the
live Supabase project or Vercel.** Do the steps below yourself, in order.
Each step leaves the live site working.

| # | Where | What | Breaking? |
|---|-------|------|-----------|
| 1 | Supabase → Authentication | Turn off sign-ups, add the two family accounts | No |
| 2 | Supabase → SQL editor | Run `supabase/migrations/20261117_01_family_board.sql` | No |
| 3 | Supabase → SQL editor | Put your emails in `app_members` | No |
| 4 | Vercel → Environment variables | Add/replace the variables listed below | No |
| 5 | Vercel | Deploy this branch (merge the PR). Check you can sign in and see your data | — |
| 6 | Box | Set up the sync (see [docs/BOX_SYNC.md](docs/BOX_SYNC.md)), run it once | No |
| 7 | Supabase → SQL editor | Run `supabase/migrations/20261117_02_lock_down_anon.sql` | **Yes**: the old deploy stops working, which is the point |
| 8 | Phone / laptop | Family board → TV screens → make a link for each TV | — |

---

## 1. Supabase Auth (dashboard → Authentication)

1. **Sign In / Providers → Email**: keep *Email* enabled. Keep **Confirm email ON**.
2. **Sign In / Providers → "Allow new users to sign up": OFF.** The app
   only sends magic links to accounts that already exist
   (`shouldCreateUser: false`), and the database only trusts confirmed
   emails on the allowlist. Turning sign-ups off is a third lock.
3. **Users → Add user → Send invitation** for each parent's email
   addresses. (Or "Create new user" with auto-confirm.)
4. **URL Configuration**:
   - Site URL: `https://life-dashboard-ely.vercel.app`
   - Redirect URLs: add `https://life-dashboard-ely.vercel.app/**` (and
     `http://localhost:5180/**` if you run it locally).
5. Optional: Emails → Magic Link template. The default works.

## 2. Migration 01: additive (safe with the current deploy)

Paste all of `supabase/migrations/20261117_01_family_board.sql` into
**SQL Editor → New query → Run**. It's safe to re-run.

It adds:

- **`todos`**: `due_date date`, `owner`, `updated_by`, `archived_at`,
  `updated_at` (+ trigger), `source` (`'box'` for synced rows), `sync_base jsonb`.
- **`people.aliases text[]`**: extra words that mean this person in event
  titles and to-dos. A person's first name always matches. Example:
  `update people set aliases = '{robbie}' where id = '<person id>';`
  The board's colour key and the person colours come from `people.name`,
  `people.color` and `people.sort_order`. Check those look right.
- **`calendar_sources`, `calendar_events`**: the box's calendar mirror.
  All-day events are stored as dates (`start_date`/`end_date`, end
  exclusive), and timed events as instants (`starts_at`/`ends_at`). A
  check constraint stops an all-day event ever being stored as a
  timestamp. That was the cause of the "6 PM the evening before" bug.
- **`review_weeks`, `review_cards`, `review_session`**: the weekly review
  (theme, wins/decisions/parked cards, the shared step timer).
- **`board_devices`**: TV links. Stores only a SHA-256 of each token.
- **`app_members`**: the email allowlist.
- **Functions**: `is_family_member()`, `board_events(date, int)`,
  `board_snapshot(token)`, `create_board_device(label)`,
  `revoke_board_device(id)`, `review_control(action)`.
- **RLS**: a `family_members` policy on every app table, for signed-in
  allowlisted users only. The new tables have no anon policy at all. The
  old tables keep their old anon policies until step 7, so the current
  deploy keeps working.

## 3. Allowlist

```sql
insert into app_members (email, name) values
  ('parent.one@example.com', 'Parent one'),
  ('parent.two@example.com', 'Parent two');
```

Emails must be **lower-case** and match the Supabase Auth accounts.
Removing a row takes that person's access away on their next request.

## 4. Vercel environment variables

| Variable | Scope | Value | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | all | `https://<project>.supabase.co` | unchanged |
| `VITE_SUPABASE_ANON_KEY` | all | publishable key (`sb_publishable_…`) | unchanged. It's public by design; after step 7 it can only sign in and call `board_snapshot` |
| `SUPABASE_SERVICE_ROLE_KEY` | Production (server only) | secret key (`sb_secret_…`) | **required by `/api/mcp`** now. There's no fallback to the publishable key. **Never** give it a `VITE_` prefix |
| `DASHBOARD_MCP_KEY` | Production (server only) | ≥ 32 random chars, e.g. `openssl rand -hex 32` | **required**. There's no default any more; without it `/api/mcp` and `/api/oauth/*` return 503. It's also the "owner key" you type once when connecting Claude.ai. Rotating it revokes every token Claude holds |
| `MCP_REDIRECT_HOSTS` | optional | default `claude.ai,claude.com` | hosts the OAuth flow may redirect back to |
| `VITE_APP_PASSPHRASE` | remove | — | ignored when Supabase is configured. Real sign-in replaces it |

After setting them, redeploy (Vite bakes `VITE_*` in at build time).

**The Claude.ai connector has to be reconnected.** The old OAuth flow handed
the key to anyone who asked, so tokens from it aren't accepted. In Claude.ai,
remove and re-add the connector, then enter `DASHBOARD_MCP_KEY` on the
grant page.

## 5. Deploy and check

Merge the PR (or deploy the branch as a preview first). Then:

- `/` and `/board` show a sign-in screen. Enter your email, open the link,
  and you're in. The session persists, so phones stay signed in.
- **Family board** tab: today, to-dos (tick one), goals, big actions, and
  the 7-day week. The week stays empty until step 6.
- Someone not on the allowlist sees "isn't on this board's family list".

## 6. Box sync

See [docs/BOX_SYNC.md](docs/BOX_SYNC.md). In short, put the URL and service-role key in
`~/.config/family-board/supabase.env` (chmod 600). Then run
`node scripts/sync-box/sync.mjs --dry-run`, then without `--dry-run`, then
add the systemd timer or cron line.

## 7. Migration 02: close the database (breaking)

Only once step 5 works for both of you. Run
`supabase/migrations/20261117_02_lock_down_anon.sql`. It:

- drops **every** policy on a public table that applies to `anon`/`public`
  (the old `*_all` blanket policies, including on the old `chats` table);
- turns RLS on for every public table, so tables with no policy are
  service-role only;
- revokes all table privileges from `anon`;
- revokes `anon`'s right to call any of our functions except `board_snapshot`.

Check it worked. In a private window, the live JS bundle's key can no longer
read anything:

```bash
curl -s "https://<project>.supabase.co/rest/v1/todos?select=id&limit=1" \
  -H "apikey: <publishable key>" -H "Authorization: Bearer <publishable key>"
# → {"code":"42501", … "permission denied for table todos"}
```

Rollback (re-opens the database to the world, emergency only) is in the
header of the migration file.

## 8. TVs

On a signed-in phone or laptop, go to **Family board → TV screens**. Name the
screen and choose **Make link**, then copy the link (it's shown once). Open it
in the TV's browser (Fire TV: Silk) and bookmark it. Use
`…/tv?mode=review#k=…` for the weekly review layout. **Revoke** stops that
screen within a minute. A revoked or unknown link shows a "no longer works"
page.

The link's token sits in the URL fragment (`#k=`), which browsers never
send to a server or in a Referer header. It only unlocks
`board_snapshot()`, which returns:

- people (names and colours), domains and folders
- open goals and actions, and open to-dos
- 9 days of events (no descriptions)
- calendar feed status (no feed URLs)
- this week's review cards and timer

It's read-only apart from a "last seen" timestamp.

---

## Fresh install (new Supabase project)

`supabase/schema.sql`, then migration 01, then 02. `schema.sql` no longer
creates any anon policies.

## What did NOT change

- No table or column was dropped or renamed. The old `chats` table is
  left in place (service-role only after step 7).
- The box is untouched. The sync opens its SQLite file read-only and never
  writes back. To-dos ticked on the web stay ticked on the web. The box's
  own `/tv` won't see those ticks, so once this is live, treat the web
  board as the one to tick on.
