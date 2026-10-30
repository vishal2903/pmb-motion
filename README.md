# PMB in Motion

Live internal dashboard for PMB founders: what each product is, who leads it, which clients it serves, where it stands (building, testing, live, waiting on client), billing status, client iterations and server costs.

Live site: https://pmb-motion.vercel.app

## How it works

```
PMB Product Tracker (Google Sheet)  ─┐
  Tracker, Servers, Iteration Log,   │   apps-script/Code.gs          web/ (static, Vercel)
  Billing Follow-up tabs             ├─> Apps Script web app  ──────>  fetches the feed every 60s
Chahat's invoice sheet (colours)    ─┘   JSON feed, 60s cache          and on tab focus
```

- **No server, no keys.** The Apps Script runs as the sheet owner and only reads. The site is plain HTML/CSS/JS.
- **Columns are matched by header name**, so adding or reordering sheet columns does not break the feed. A table ends at its first blank header column.
- **Billing status** comes from the cell colours in Chahat's invoice sheet, using the legend in its first row.
- **North Star** = rows that are live or being built, over all active rows. Blank statuses count against it; paused rows are excluded. It is shown with its breakdown and with how complete the sheet is.

## Layout

| Path | What |
|---|---|
| `apps-script/Code.gs` | The feed. Paste into the Tracker sheet's Extensions > Apps Script |
| `web/` | The site: `briefing`, `products`, `people`, `servers` pages; `app.js` (data rules), `shell.js` (shared UI). Copy `config.example.js` to `config.js` and set the feed URL (not committed) |
| `tests/` | `node tests/feed.test.js` and `node tests/ingest.test.js` |

## Updating

- **Feed:** paste the new `Code.gs`, save, then Deploy > Manage deployments > edit > Version: New version > Deploy. The URL stays the same.
- **Site:** `cd web && npx vercel deploy --prod`
- **Before either:** run both tests.
