# Box → Supabase sync

`scripts/sync-box/sync.mjs` copies the box Command Centre's **to-dos** and
**calendar** (`/home/box/command-centre/data/cc.db`) into Supabase, so the
family board online shows what the box knows. Run it on the box.

- **Read-only on the box.** It opens the SQLite file with
  `readOnly: true` and never writes to it.
- **No dependencies.** It uses Node's built-in `node:sqlite` and `fetch`,
  so you need **Node 22.5 or newer** (`node -v`). You don't need
  `npm install`.
- **Secrets stay in an env file**, never on the command line. Key values
  are never printed.
- **Idempotent.** Run it as often as you like. Every 5 minutes is fine.

## What it syncs

| Box | Supabase | How |
|---|---|---|
| `todos` | `todos` (`source = 'box'`) | Same ids. New ones are inserted. For changed ones, a **three-way merge**: a field the box changed since the last sync takes the box value, and a field only changed on the web (e.g. ticked on a phone) is kept. If both changed, the box wins and it's counted in the output. Gone from the box → `archived_at` (never deleted). |
| `calendar_sources` | `calendar_sources` | Name and feed status. **Not the ICS URL.** Error text has URLs redacted. |
| `calendar_events` | `calendar_events` | Upsert by id. Gone from the box → `archived_at`. Descriptions and raw ICS aren't copied. |

**All-day events:** any event whose start is a bare date (`2026-11-20`)
becomes an all-day event with `start_date`/`end_date`, even if the box
flagged it as timed. The box had such rows, and reading them as instants
is what put them at 6 PM the evening before. The database's check
constraint refuses any other shape.

## Set up

1. Get a checkout of this repo on the box, e.g.
   `git clone https://github.com/martinjely84/life-dashboard ~/life-dashboard`.
2. Create the env file (it's outside the repo, so it can't be committed):

   ```bash
   mkdir -p ~/.config/family-board
   install -m 600 /dev/null ~/.config/family-board/supabase.env
   nano ~/.config/family-board/supabase.env
   ```

   ```ini
   SUPABASE_URL=https://<project>.supabase.co
   # Supabase → Project Settings → API Keys → Secret key (sb_secret_…).
   # NOT the publishable key; the script refuses that one.
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
   # Optional:
   # CC_DB_PATH=/home/box/command-centre/data/cc.db
   # SYNC_CALENDAR_SOURCES=family,work,board   # default: all of them
   ```

   The script warns if the file is readable by other users.

3. Try it:

   ```bash
   cd ~/life-dashboard
   node scripts/sync-box/sync.mjs --check-db   # offline: reads the box DB, no network, no key
   node scripts/sync-box/sync.mjs --dry-run    # reads Supabase, writes nothing
   node scripts/sync-box/sync.mjs              # for real
   ```

   Output is counts only, e.g.
   `synced {"todos":{"box":31,"inserted":31,…},"calendar":{"events":123,"all_day":24,"date_only_fixed":3,…}}`.

## Run it every 5 minutes

**systemd (user) timer:**

```ini
# ~/.config/systemd/user/family-board-sync.service
[Unit]
Description=Push Command Centre to-dos and calendar to Supabase

[Service]
Type=oneshot
WorkingDirectory=%h/life-dashboard
ExecStart=/usr/bin/env node scripts/sync-box/sync.mjs
```

```ini
# ~/.config/systemd/user/family-board-sync.timer
[Unit]
Description=Family board sync every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now family-board-sync.timer
loginctl enable-linger "$USER"      # keep running when logged out
journalctl --user -u family-board-sync -n 20
```

**or cron:**

```cron
*/5 * * * * cd $HOME/life-dashboard && /usr/bin/env node scripts/sync-box/sync.mjs >> $HOME/.local/state/family-board-sync.log 2>&1
```

## Options

| Flag | Meaning |
|---|---|
| `--env PATH` | env file (default `~/.config/family-board/supabase.env`, or `$FAMILY_BOARD_ENV`) |
| `--db PATH` | box database (default `/home/box/command-centre/data/cc.db`, or `CC_DB_PATH`) |
| `--dry-run` | compute everything, write nothing |
| `--only todos` / `--only calendar` | one half only |
| `--check-db` | offline sanity check of the box database |

## Good to know

- The box's ICS sync keeps running as before. This script only mirrors its
  results, so the online calendar is at most ~5 minutes behind the box.
- Ticks made on the web are **not** written back to the box (the box is
  read-only to this script). If someone un-ticks a to-do on the box after
  it was ticked on the web, the box's change wins on the next sync.
- To-dos made on the web stay web-only (`source` is null) and the sync
  never touches them.
- Tests: `npm test` covers the mapping and merge (`tests/sync-map.test.mjs`).
