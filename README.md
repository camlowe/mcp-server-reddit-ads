# mcp-server-reddit-ads

A Reddit Ads API v3 MCP server with working write operations and tiered safety controls, built and dogfooded by an actual Reddit advertiser. It gives an MCP client read access to campaigns, ad groups, ads, and performance reports, plus gated write tools for pausing, creating, budget and bid changes, targeting edits, and copying ads between ad groups.

## Quick start

1. Register an app in the Reddit Ads dashboard under Business settings > Developer Applications, with redirect URI `http://localhost:8080`. (reddit.com/prefs/apps silently rejects new apps under the Responsible Builder Policy, so the Ads developer portal is the working path.)

2. Mint a refresh token:

   ```bash
   npx mcp-server-reddit-ads auth
   ```

   This opens the Reddit authorize page, listens on `http://localhost:8080` for the callback, and prints a ready-to-paste config block with all three credentials filled in.

3. Add the printed block to your MCP client. For Claude Code:

   ```bash
   claude mcp add reddit-ads -- npx -y mcp-server-reddit-ads
   ```

   Or add it to your `.mcp.json` directly:

   ```json
   {
     "mcpServers": {
       "reddit-ads": {
         "command": "npx",
         "args": ["-y", "mcp-server-reddit-ads"],
         "env": {
           "REDDIT_CLIENT_ID": "...",
           "REDDIT_CLIENT_SECRET": "...",
           "REDDIT_REFRESH_TOKEN": "...",
           "REDDIT_ADS_WRITE_TIER": "read"
         }
       }
     }
   }
   ```

4. Restart your MCP client. It starts read-only. Raise `REDDIT_ADS_WRITE_TIER` to enable writes.

## Write tiers

Writes are off by default. `REDDIT_ADS_WRITE_TIER` opens them in two steps, so an accident at the read or safe tier cannot start spending money.

| Tier | What it allows | Rule |
|---|---|---|
| `read` (default) | No writes. | Reads only. |
| `safe` | Pause, create (born paused), rename, copy ads. | Cannot start or expand delivery. |
| `spend` | Everything in `safe`, plus enable, budget, bid, and targeting changes. | Can start, resume, or reshape delivery. |

### Environment variables

| Variable | Meaning |
|---|---|
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_REFRESH_TOKEN` | Required. Startup fails with a pointer to the `auth` command if any is missing. |
| `REDDIT_ADS_WRITE_TIER` | `read` (default), `safe`, or `spend`. |
| `REDDIT_ADS_ACCOUNT_ID` | Optional default account (`a2_...`) so single-account users never pass `account_id`. |

## Tools

| Group | Tools | Tier |
|---|---|---|
| Accounts | `get_accounts`, `get_account_overview` | read |
| Entities | `get_campaigns`, `get_campaign`, `get_ad_groups`, `get_ad_group`, `get_ads`, `get_ad` | read |
| Reporting | `get_performance_report`, `get_daily_performance` | read |
| Targeting data | `search_subreddits`, `get_interest_categories`, `search_geo_targets` | read |
| Create | `create_campaign`, `create_ad_group`, `create_ad` | safe |
| Pause / rename | `pause_items`, `update_name` | safe |
| Workflows | `copy_ads` | safe |
| Resume | `enable_items` | spend |
| Money | `update_budget`, `update_bid` | spend |
| Delivery shape | `update_targeting` | spend |

Notes:

- `get_performance_report` takes friendly lowercase metric names (`impressions`, `clicks`, `spend`, `cpc`, `conversion_page_visit_clicks`, and so on) and validates them locally before the call, suggesting the closest match on a typo.
- `create_ad_group` requires a `conversion_pixel_id`, and `create_campaign` requires one when campaign budget optimization is on (a Reddit mandate since 2026-07-13). The pixel id is in the Reddit Ads dashboard under Events Manager; in observed data it equals the ad account id.
- `copy_ads` duplicates ads into another ad group (Reddit creates a duplicate promoted post per copy) with an option to rewrite `utm_campaign` and other click-URL query params.

## Reddit API gotchas

The client encodes behaviors verified against the live API. The two that cause the most confusion:

- **Updates use `PATCH`, never `PUT`, and Reddit returns 404 (not 405) for the wrong verb.** A verb bug looks exactly like a missing resource. This is the bug that breaks every write in the upstream package.
- **Single resources live on bare paths (`/ads/{id}`); collections and creates use account-scoped paths (`/ad_accounts/{id}/ads`).** Mixing them returns 404.
- **All money values are microcurrency (one millionth of the currency unit).** This server converts them to USD on read and back on write, so tool inputs and outputs are in dollars.

Full details, including the reporting-metric enum quirks and status semantics, are in [docs/api-notes.md](docs/api-notes.md).

## Development

```bash
npm install
npm test          # unit and contract tests (no live API calls)
npm run typecheck
npm run lint
npm run build
npm run smoke     # manual, hits the live API; needs real credentials in env
```

## License

MIT
