# Changelog

## 0.2.0 (2026-07-20)

- Tools above the configured write tier are no longer registered at all: read-only sessions expose 13 tools instead of 23 refusing ones. The call-time gate remains as defense-in-depth.
- Tool results are capped at 200,000 characters with a note suggesting how to narrow the query.
- `get_campaigns`, `get_ad_groups`, and `get_ads` accept an optional `status` filter (`ACTIVE` / `PAUSED` / `ARCHIVED`) on `configured_status`.
- Startup banner reports how many tools are hidden by the current tier.

## 0.1.0 (2026-07-20)

Initial release.

- 23 tools across accounts, entities, reporting, targeting data, create, pause/rename, copy, resume, budget/bid, and targeting edits.
- Working write operations via the correct `PATCH` verb and bare-vs-account-scoped path table, verified against the live Reddit Ads API v3.
- Tiered write gating (`read` / `safe` / `spend`) enforced in one place, off by default.
- `npx mcp-server-reddit-ads auth`: interactive one-time OAuth helper that mints a refresh token via a localhost callback and prints a ready-to-paste config block.
- Microcurrency-to-USD conversion, friendly metric names with typo suggestions, retry with backoff on 429/5xx, pagination, and readable errors that extract the offending field from Reddit's enum-dump 400s.
