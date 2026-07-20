# Reddit Ads API v3 - Field Notes

These behaviors were verified by direct calls against the live Reddit Ads API v3,
plus findings about the third-party server this project replaces. They are the
knowledge base behind this server's client and error handling.

## 1. Reddit Ads API v3 - verified behaviors

All of this was confirmed by direct API calls with real credentials, not from docs.

### App registration (the hard part)

- **reddit.com/prefs/apps is dead for new apps.** Since early 2026, Reddit's
  [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy)
  requires approval before app creation. The create button silently no-ops and shows a
  policy link. Known issue in the community (e.g. Apollo-ImprovedCustomApi issue #82).
- **The Ads developer portal is the working path for advertisers:** Reddit Ads dashboard
  → business settings → **Developer Applications** → Create App. This registers an OAuth
  app under the Ads API Terms with no separate approval wait. Fields: app name,
  description, about url (optional), redirect uri (required), primary contact (must be a
  business admin).
- `http://localhost:8080` is accepted as redirect URI.

### OAuth flow (verified end to end)

1. Authorize URL: `https://www.reddit.com/api/v1/authorize?client_id=...&response_type=code&state=...&redirect_uri=http://localhost:8080&duration=permanent&scope=adsread+adsedit+read`
   - **`duration=permanent` is mandatory** to get a refresh token; without it you get a
     short-lived access token only.
   - Scopes for full ads management: `adsread adsedit read` (granted string comes back
     as `read adsread adsedit`). `history` and `adsconversions` also exist. Without
     `identity`, `/me` returns no username (upstream server logs "logged in as unknown" -
     cosmetic).
2. Exchange code at `https://www.reddit.com/api/v1/access_token` with **HTTP Basic auth**
   (`client_id:client_secret`), body `grant_type=authorization_code&code=...&redirect_uri=...`
   (redirect_uri must match exactly).
3. Refresh: same endpoint, `grant_type=refresh_token&refresh_token=...`. Watch for
   rotation: if the response includes a new `refresh_token`, persist it (upstream logs a
   warning when this happens; in practice ours has not rotated).
4. A `User-Agent` header is required on all Reddit requests.

### Endpoint shapes (the critical, undocumented-feeling part)

Base URL: `https://ads-api.reddit.com/api/v3`

| Operation | Shape | Verified |
|---|---|---|
| List campaigns / ad groups / ads | `GET /ad_accounts/{acct}/campaigns` etc. Ads list accepts `?ad_group_id=` filter | 200 |
| Identity / accounts | `GET /me`, `GET /me/businesses`, `GET /businesses/{biz}/ad_accounts` | 200 |
| Reports | `POST /ad_accounts/{acct}/reports` with `{"data": {...}}` | 200 |
| **Single resource GET** | **Bare path:** `GET /ads/{id}` | 200 |
| Single resource GET, account-scoped | `GET /ad_accounts/{acct}/ads/{id}` | **404** |
| **Update** | **`PATCH /ads/{id}`** (same for `/campaigns/{id}`, `/ad_groups/{id}`), body `{"data": {"configured_status": "PAUSED", ...}}` | 200 |
| Update via PUT | `PUT /ads/{id}` | **404** (not 405!) |
| Create | `POST /ad_accounts/{acct}/ads` etc., body `{"data": {...}}` | (used by upstream; creates work) |

**Key trap: Reddit returns 404 for both wrong paths AND wrong methods.** A `PUT` to a
perfectly valid resource 404s, which sends you hunting for path bugs that don't exist.

- Singular resources live on **bare paths** (`/ads/{id}`), collections on
  **account-scoped paths** (`/ad_accounts/{acct}/ads`). Mixing these up = 404.

### Reporting API specifics

- Metric field names are **UPPERCASE enums** in the request; responses come back
  lowercase. Naming is inconsistent: it's `CONVERSION_SIGN_UP_CLICKS` (with underscores
  in SIGN_UP) but `CONVERSION_SIGNUP_TOTAL_VALUE` (without). Getting a field wrong
  returns 400 with the complete ~400-entry enum list in the error (useful once, huge).
- Useful verified fields: `IMPRESSIONS, CLICKS, SPEND, CTR, CPC, ECPM,
  CONVERSION_PAGE_VISIT_CLICKS, CONVERSION_LEAD_CLICKS, CONVERSION_SIGN_UP_CLICKS,
  KEY_CONVERSION_TOTAL_COUNT`.
- Breakdowns: `date, campaign_id, ad_group_id, ad_id, country, region, community,
  placement, device_os` (as lowercase strings in the upstream tool; the API also has
  AGE, GENDER, HOUR, INTEREST, KEYWORD, DMA per the error enum).
- **All money is microcurrency** (divide by 1,000,000): spend, cpc, ecpm, bid_value,
  goal_value (daily budget), spend_cap.
- Response includes `metrics_updated_at` - data freshness marker.
- Date params accept `YYYY-MM-DD` but the API wants ISO 8601; upstream appends
  `T00:00:00Z`.

### Entity/status semantics

- `configured_status` (what you set) vs `effective_status` (what's true) vs
  `delivery_status` (array of reasons, e.g. `AD_GROUP_PAUSED`, `NO_ACTIVE_CHILDREN`,
  `AD_GROUP_IN_LIMITED_LEARNING`). After a PATCH, `configured_status` updates instantly
  but `effective_status` lags by minutes - always read back `configured_status` to verify
  a write, not `effective_status`.
- Ad accounts have ids like `a2_*`, businesses are UUIDs, users/profiles `t2_*`,
  posts `t3_*`. Promoted-post ads reference a `post_id`/`post_url`; "copying" an ad to
  another ad group creates a **duplicate post** with its own t3 id.
- Campaigns/ad groups/ads all support `PAUSED`/`ACTIVE` configured_status; ad groups can
  also be `ARCHIVED`.
- From docs research: **since 2026-07-13, ad groups and CBO campaigns require a
  `conversion_pixel_id`** on create.
- Bid strategies seen in the wild: `BIDLESS` (CPM), `MAXIMIZE_VOLUME` (CPC with cap),
  `MANUAL_BIDDING` (CPC). Goal: `DAILY_SPEND` + `goal_value` micro.

---

## 2. Upstream package findings (mharnett/mcp-reddit-ads v1.1.2)

The package we're replacing. MIT, TypeScript, ~18 tools, actively maintained
(v1.1.2 2026-07-09).

### The write-breaking bug

- `updateCampaign`, `updateAdGroup`, `updateAd` in `dist/index.js` call
  `apiCall("PUT", ...)`. Reddit only accepts `PATCH`. **Every write tool 404s**,
  including `pause_items`/`enable_items` (they wrap the update functions).
- Paths are correct (bare `/ads/{id}` etc.) - it is purely the HTTP verb.
- **We patched the locally installed copy** (3 lines, PUT→PATCH) at
  `/opt/homebrew/lib/node_modules/mcp-reddit-ads/dist/index.js` and verified
  `pause_items` works after. `npm update -g` will wipe the patch.
- Worth filing as an upstream issue/PR - one-line fix, and good OSS citizenship from
  someone shipping a competing server.

### Other quirks

- `resolveAccountId` validates account ids start with `t2_`, but real ad account ids are
  `a2_*` - the validation is evidently not applied on the main code paths (reads work
  fine with `a2_`), i.e. dead-ish code with a wrong assumption.
- No default-account support unless configured; calls without `account_id` throw
  "No account_id provided and no default configured". Minor friction every call.
- Startup smoke: logs `[build] SHA`, credential validation, "Auth verified: logged in as
  unknown" (missing `identity` scope), write-mode banner. Nice pattern.
- Good ideas worth keeping in our build: resilience layer via cockatiel
  (retry + circuit breaker + timeout), created-entities-default-PAUSED, env-gated
  writes, default report metrics.

### What it lacks (our roadmap fuel)

- Working writes (fixed locally, broken for everyone else until upstream merges).
- Budget/bid update tools, targeting edit tools.
- Copy-ads-between-ad-groups workflow (real need: hit it today).
- A refresh-token setup helper (the single worst part of onboarding - we hand-rolled a
  localhost:8080 callback script).
- Single-ad GET (list-only), conversion metrics in default reports.

