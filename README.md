# mcp-server-reddit-ads

A Reddit Ads API v3 MCP server with working write operations and tiered safety controls, built and dogfooded by an actual Reddit advertiser. It gives an MCP client read access to campaigns, ad groups, ads, and performance reports, plus gated write tools for pausing, creating, budget and bid changes, targeting edits, and copying ads between ad groups.

## Requirements

- A Reddit Ads account, with business-admin access so you can register an app.
- Node.js 20 or newer.
- An MCP client (Claude Code, Claude Desktop, or any other).

## Getting started

There are two ways to set it up. Either way, a fresh install is read-only and cannot change anything in your account until you deliberately turn on writes (the last step).

### Simple setup (Claude Code)

If you use Claude Code, let it do the mechanical work. Point it at this repository and ask, for example:

> Set up the mcp-server-reddit-ads MCP server from https://github.com/camlowe/mcp-server-reddit-ads for me, read-only. Walk me through registering the Reddit app, run the `auth` command, and add the server to my MCP config.

Claude reads this README, tells you exactly what to do for the parts only you can do, runs `npx mcp-server-reddit-ads auth`, writes your `.mcp.json`, and confirms the server loads. Later, when you want to make changes, just ask it to raise the write tier.

You still register the Reddit app (step 1 below) and approve the browser login yourself - those cannot be automated.

### Advanced setup (manual)

The full process, for other MCP clients or if you prefer to do it by hand. It takes about five minutes.

#### 1. Register a Reddit app

In the Reddit Ads dashboard, go to **Business settings > Developer Applications > Create App**. Give it a name, set the **redirect URI** to exactly `http://localhost:8080`, and choose a primary contact (a business admin). Save it, then copy the **client ID** and **client secret** it shows you - you need both in the next step.

Do not use reddit.com/prefs/apps: it silently rejects new apps under the Responsible Builder Policy, so the Ads developer portal is the only working path for advertisers.

#### 2. Mint a refresh token

Run the built-in setup helper:

```bash
npx mcp-server-reddit-ads auth
```

It asks for the client ID and secret from step 1 (or reads them from `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` if you have set them), opens the Reddit authorization page in your browser, and waits on `http://localhost:8080` for you to approve. Once you approve, it prints a ready-to-paste configuration block with all three credentials already filled in.

If it fails, it tells you how to fix the two common causes: port 8080 already in use, and a redirect-URI mismatch (the app's redirect URI must be exactly `http://localhost:8080`).

#### 3. Add the server to your MCP client

Paste the block from step 2 into your client's `.mcp.json`. It has this shape, with the three credential values already populated by the `auth` command:

```json
{
  "mcpServers": {
    "reddit-ads": {
      "command": "npx",
      "args": ["-y", "mcp-server-reddit-ads"],
      "env": {
        "REDDIT_CLIENT_ID": "your-client-id",
        "REDDIT_CLIENT_SECRET": "your-client-secret",
        "REDDIT_REFRESH_TOKEN": "your-refresh-token",
        "REDDIT_ADS_WRITE_TIER": "read"
      }
    }
  }
}
```

Claude Code users can register it from the command line instead:

```bash
claude mcp add reddit-ads \
  -e REDDIT_CLIENT_ID=your-client-id \
  -e REDDIT_CLIENT_SECRET=your-client-secret \
  -e REDDIT_REFRESH_TOKEN=your-refresh-token \
  -e REDDIT_ADS_WRITE_TIER=read \
  -- npx -y mcp-server-reddit-ads
```

#### 4. Restart and verify

Restart your client so it picks up the server (in Claude Code, approve the server when prompted, and confirm it loaded with `/mcp`). Then ask it to **list your Reddit ad accounts**. You should see your account id (`a2_...`). If you manage a single account, set `REDDIT_ADS_ACCOUNT_ID` to that id in the config and restart, so you never have to name the account in a request again.

#### 5. Try some read-only queries

You are connected and read-only. Good first questions:

- "Give me an overview of my Reddit ad account."
- "Show the last 7 days of performance by campaign."
- "Which of my ad groups are currently active?"

Most people stay here day to day. When you want to make changes, turn on writes.

#### 6. Turn on writes when you need them

A fresh install cannot pause, create, or edit anything. To allow changes, raise `REDDIT_ADS_WRITE_TIER` in your config and restart. Start with `safe` (nothing at that level can start or grow spend) and move to `spend` only when you intend to resume delivery or change budgets, bids, or targeting. See [Write tiers](#write-tiers) for exactly what each level unlocks.

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
- **Report metric names are UPPERCASE enums in requests but lowercase in responses, with inconsistent spelling** (`CONVERSION_SIGN_UP_CLICKS` vs `CONVERSION_SIGNUP_TOTAL_VALUE`). Use the friendly lowercase names; the server validates and maps them.
- **After a write, trust `configured_status`, not `effective_status`.** The configured value updates immediately; the effective value can lag by minutes.

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
