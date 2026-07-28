# Changelog

## 0.5.3 (2026-07-28)

- Fixed the version reported to MCP clients. It was hardcoded to `0.4.0` and had not moved for three releases, so every client saw the wrong version on `initialize`. It now reads from `package.json`, with a test pinning the two together so it cannot drift again.
- Added a `Dockerfile` for running the server in a container, and for registry health checks that need to start it and enumerate tools without credentials. Read tier by default, so no tool that can change an ad account is registered. Placeholder credential values are overridden at runtime with `-e`.
- Added a `.dockerignore`, so `docker build` cannot pull local credential files into the build context.

## 0.5.2 (2026-07-27)

- Published to the official MCP registry as `io.github.camlowe/mcp-server-reddit-ads`. `server.json` is now tracked in the repo, and the release workflow publishes to the registry straight after npm, authenticating with the same OIDC token already used for npm provenance (no new secrets).
- Added the `mcpName` field to `package.json`. The registry verifies npm ownership by matching it against the server name, and the release workflow now fails early if the two ever disagree.
- The release version is stamped into both of `server.json`'s version fields from the git tag, so the registry listing cannot drift from the published npm version.

## 0.5.1 (2026-07-27)

- Discoverability metadata only, no functional change: expanded npm `keywords` from 5 to 17 so the package surfaces for searches like `mcp-server`, `reddit-api`, `ads-api`, `paid-social`, and `claude-code`. GitHub repo topics and homepage URL were updated alongside this.

## 0.5.0 (2026-07-21)

- `auth` can now write the MCP config for you. After a successful login it offers an interactive menu to save the credentials to Claude Code (`./.mcp.json`) or Claude Desktop (`claude_desktop_config.json`), or to just print the block as before. Writes patch in place: other servers are left untouched, an existing `reddit-ads` entry keeps its `command`/`args` and extra env (account id, write tier) with only the credentials refreshed, and the previous file is backed up to `<file>.bak`. A file with invalid JSON is never overwritten. Because the write happens in your own terminal, credentials no longer need to be pasted through an MCP client.

## 0.4.0 (2026-07-20)

- New `find_entity` tool (read tier): resolve campaign/ad group/ad names to ids with a case-insensitive substring search.
- New `compare_periods` tool (read tier): trailing N days vs the N days before, with absolute and percent change per metric.
- New `compare_ads` tool (read tier): per-ad performance within an ad group, joined with ad names and creative headlines, sorted by spend.

## 0.3.0 (2026-07-20)

- New `get_server_status` diagnostic tool (read tier): API connectivity, write tier, hidden-tool count, and default account in one call.
- New `update_ad_url` tool (spend tier): change an existing ad's click-through URL, either wholesale or by rewriting individual query params (UTMs). Backed by live-verified `PATCH /ads/{id}` click_url behavior.
- New `get_ad_creative` tool (read tier): read the headline, body, media, and post URL behind an ad via its promoted post.
- New `update_ad_comments` tool (safe tier): toggle commenting on an ad's post - the only post property the API allows changing (headline and body are immutable, verified live).

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
