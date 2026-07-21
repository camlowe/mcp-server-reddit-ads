# mcp-server-reddit-ads

A Reddit Ads API v3 MCP server with working write operations and tiered safety controls, built and dogfooded by an actual Reddit advertiser. It gives an MCP client read access to campaigns, ad groups, ads, and performance reports, plus gated write tools for pausing, creating, budget and bid changes, targeting edits, and copying ads between ad groups.

## Requirements

- A Reddit Ads account, with business-admin access so you can register an app.
- Node.js 20 or newer.
- An MCP client (Claude Code, Claude Desktop, or any other).

## Getting started

Pick the path that matches your setup: a paste-one-prompt route for Claude Code or Claude Desktop, or the manual steps for any other client. Every path installs read-only and cannot change anything in your account until you deliberately turn on writes (the last step).

### Simple setup with Claude Code (recommended)

If you use Claude Code, let it do the mechanical work. Copy this whole prompt and paste it into Claude Code:

```text
Set up the mcp-server-reddit-ads MCP server for me so I can manage my Reddit Ads
account from here. Install it read-only for now - no write access. Please:

1. Read the setup instructions at https://github.com/camlowe/mcp-server-reddit-ads
2. Check I'm on Node.js 20 or newer.
3. Walk me through registering a Reddit app, since only I can do that part. Tell me
   exactly where to click and which two values (client ID and client secret) to copy.
4. Run `npx mcp-server-reddit-ads auth` and guide me through the browser login.
5. Add the server to my .mcp.json using the credentials from the auth step, with the
   write tier set to read-only.
6. Confirm the server loads and list my Reddit ad accounts to prove it works.

Do not enable any write access yet. I'll ask for that later when I'm ready.
```

Claude reads this README, tells you exactly what to do for the parts only you can do, runs `npx mcp-server-reddit-ads auth`, writes your `.mcp.json`, and confirms the server loads. Later, when you want to make changes, just ask it to raise the write tier.

### Simple setup with Claude Desktop

Claude Desktop can't run terminal commands for you, so this prompt has it act as a patient guide while you run one command and edit one config file. Paste it into a new Claude Desktop chat:

```text
I want to set up the mcp-server-reddit-ads MCP server so I can manage my Reddit Ads
account with you. I'm not a developer, so please guide me one step at a time with
simple, copy-pasteable instructions, and wait for me to confirm each step before
moving to the next.

Look up the setup details at https://github.com/camlowe/mcp-server-reddit-ads. The
main steps are: register a Reddit app to get a client ID and secret, run a one-time
`npx mcp-server-reddit-ads auth` command in my terminal to log in, and add the server
to my Claude Desktop config file. Set it up read-only so nothing in my account can
change until I decide to turn writes on.
```

Either way, you still register the Reddit app (step 1 below) and approve the browser login yourself - those cannot be automated.

### Advanced setup (manual)

The full process, for other MCP clients or if you prefer to do it by hand. It takes about five minutes.

#### 1. Register a Reddit app

1. Open the Reddit Ads dashboard at [ads.reddit.com](https://ads.reddit.com) and sign in with an account that has business-admin access.
2. Open **Business settings** (the gear / settings menu, top right), then **Developer Applications**, then **Create App**.
3. Give the app a name, set the **redirect URI** to exactly `http://localhost:8080`, and choose a primary contact (a business admin). Save it.

Reddit then shows the two values you need in step 2:

- **Client ID** - the short string (roughly 22 characters, for example `Ab3xK9zQ1rStUvWxYzAbCd`) displayed directly under the app's name. Reddit often shows it without a "client ID" label, so it is easy to miss; it is the code beneath the app title, not the app name itself.
- **Client secret** - the longer value shown in the field explicitly labeled **secret**. Copy it right away; if you lose it you can regenerate a new secret from the same page.

Do not use reddit.com/prefs/apps: it silently rejects new apps under the Responsible Builder Policy, so the Ads developer portal is the only working path for advertisers.

#### 2. Mint a refresh token

Run the built-in setup helper:

```bash
npx mcp-server-reddit-ads auth
```

It asks for the client ID and secret from step 1 (or reads them from `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` if you have set them), opens the Reddit authorization page in your browser, and waits on `http://localhost:8080` for you to approve.

Once you approve, it offers to save the configuration for you:

```
Where should I save this? (I'll patch the file, keeping anything already there.)
  [1] Claude Code    ./.mcp.json
  [2] Claude Desktop <your platform's claude_desktop_config.json>
  [3] Just print it  (don't write any file)
```

Pick [1] or [2] and it writes the credentials straight to disk (backing up any existing file to `<file>.bak` and leaving other servers untouched), so nothing sensitive has to pass through your MCP client. If you prefer to place it yourself, pick [3] and it prints a ready-to-paste block instead. When it can't detect a TTY (for example, piped output), it skips the menu and prints the block.

If it fails, it tells you how to fix the two common causes: port 8080 already in use, and a redirect-URI mismatch (the app's redirect URI must be exactly `http://localhost:8080`).

#### 3. Add the server to your MCP client

If you picked [1] or [2] in step 2, this is already done - skip to step 4. Otherwise, paste the printed block into your client's config. It has this shape, with the three credential values already populated by the `auth` command:

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

Tools above the configured tier are not just refused - they are hidden from the client's tool list entirely. A read-only session exposes 18 tools; the model cannot even attempt `update_budget` because it does not know the tool exists. If a hidden tool is somehow called anyway, the server refuses it with an error naming the tier that would unlock it.

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
| Diagnostics | `get_server_status` | read |
| Accounts | `get_accounts`, `get_account_overview` | read |
| Entities | `get_campaigns`, `get_campaign`, `get_ad_groups`, `get_ad_group`, `get_ads`, `get_ad` | read |
| Creative | `get_ad_creative` | read |
| Search | `find_entity` | read |
| Reporting | `get_performance_report`, `get_daily_performance`, `compare_periods`, `compare_ads` | read |
| Targeting data | `search_subreddits`, `get_interest_categories`, `search_geo_targets` | read |
| Create | `create_campaign`, `create_ad_group`, `create_ad` | safe |
| Pause / rename | `pause_items`, `update_name` | safe |
| Comments | `update_ad_comments` | safe |
| Workflows | `copy_ads` | safe |
| Resume | `enable_items` | spend |
| Money | `update_budget`, `update_bid` | spend |
| Delivery shape | `update_targeting` | spend |
| Ad URL | `update_ad_url` | spend |

Notes:

- `get_campaigns`, `get_ad_groups`, and `get_ads` take an optional `status` filter (`ACTIVE`, `PAUSED`, or `ARCHIVED`), applied client-side on `configured_status`.
- Tool results are capped at 200,000 characters; a truncated result says so and suggests narrowing the query.
- `get_performance_report` takes friendly lowercase metric names (`impressions`, `clicks`, `spend`, `cpc`, `conversion_page_visit_clicks`, and so on) and validates them locally before the call, suggesting the closest match on a typo.
- `create_ad_group` requires a `conversion_pixel_id`, and `create_campaign` requires one when campaign budget optimization is on (a Reddit mandate since 2026-07-13). The pixel id is in the Reddit Ads dashboard under Events Manager; in observed data it equals the ad account id.
- `copy_ads` duplicates ads into another ad group (Reddit creates a duplicate promoted post per copy) with an option to rewrite `utm_campaign` and other click-URL query params.
- Ad copy (headline, body) is immutable via the Reddit API - the only editable post property is `allow_comments`. To change what an ad says, create a new ad with the new copy, enable it, and pause the old one.

## Reddit API gotchas

The client encodes behaviors verified against the live API. The ones that cause the most confusion:

- **Updates use `PATCH`, never `PUT`, and Reddit returns 404 (not 405) for the wrong verb.** A verb bug looks exactly like a missing resource. This is the bug that breaks every write in the upstream package.
- **Single resources live on bare paths (`/ads/{id}`); collections and creates use account-scoped paths (`/ad_accounts/{id}/ads`).** Mixing them returns 404.
- **All money values are microcurrency (one millionth of the currency unit).** This server converts them to USD on read and back on write, so tool inputs and outputs are in dollars.
- **Report metric names are UPPERCASE enums in requests but lowercase in responses, with inconsistent spelling** (`CONVERSION_SIGN_UP_CLICKS` vs `CONVERSION_SIGNUP_TOTAL_VALUE`). Use the friendly lowercase names; the server validates and maps them.
- **After a write, trust `configured_status`, not `effective_status`.** The configured value updates immediately; the effective value can lag by minutes.
- **Ad copy cannot be edited.** The creative lives on a promoted post, and `PATCH /posts/{id}` permits exactly one field: `allow_comments`. Headline and body are rejected outright. Changing copy means shipping a new ad (`create_ad`, born paused) and pausing the old one - which also keeps performance history per message, so it is the right workflow anyway.

## Development

```bash
npm install
npm test          # unit and contract tests (no live API calls)
npm run typecheck
npm run lint
npm run build
npm run smoke     # manual, hits the live API; needs real credentials in env
```

## Disclaimer

This software is provided "as is" and "as available", without warranty of any kind, as set out in the [LICENSE](LICENSE). It may contain bugs or errors, and any safeguards or controls it provides may fail or behave unexpectedly. Use it at your own risk.

This tool can create, rename, pause, resume, and reconfigure live Reddit advertising entities, and can change budgets, bids, and targeting. These actions can start, increase, or otherwise affect real ad spend. You are solely responsible for:

- any charges, ad spend, or financial outcomes that result from using this server;
- independently reviewing and verifying every change it makes to your account;
- keeping your Reddit API credentials secure; and
- your use of the Reddit Ads API in line with Reddit's terms.

The author accepts no liability for lost or unintended ad spend, misconfigured or paused campaigns, unintended changes, or any other damages arising from use of this software, including any failure of its safety controls to prevent an action.

This project is an independent, unofficial client. It is not affiliated with, endorsed by, or sponsored by Reddit, Inc.

## License

MIT
