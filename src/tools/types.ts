import type { RedditAdsClient } from "../client.js";
import type { Config } from "../config.js";

export interface ToolContext {
  client: RedditAdsClient;
  config: Config;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  // The MCP SDK's tool-callback return type carries an index signature; mirror it
  // so handlers returning ToolResult type-check against registerTool.
  [key: string]: unknown;
}

/** Resolve account id from arg or configured default; throw a clear error otherwise. */
export function requireAccount(ctx: ToolContext, accountId?: string): string {
  const id = accountId ?? ctx.config.defaultAccountId;
  if (!id)
    throw new Error(
      "No account_id given and REDDIT_ADS_ACCOUNT_ID is not set. Pass account_id or set the env var (find yours with get_accounts)."
    );
  return id;
}

// MCP tool annotations. These are behavioural hints a client can show or reason
// about before calling: whether a tool writes, whether a repeat call does
// anything, and whether it reaches an external system. Every tool here talks to
// the Reddit Ads API, so openWorldHint is always true.
//
// destructiveHint distinguishes additive writes (a create leaves everything else
// alone) from writes that overwrite existing configuration or start real spend.
// idempotentHint is false only where a repeat call produces another entity.

/** Reads only. Safe to call speculatively. */
export const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

/** Creates something new; nothing existing is changed. Repeats duplicate it. */
export const ADDITIVE_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/** Reversible change that only reduces delivery, e.g. pausing. Repeats are no-ops. */
export const REVERSIBLE_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Overwrites existing configuration, or resumes real spend. Repeats are no-ops. */
export const OVERWRITING_WRITE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Hard cap on a single tool result, to stay well inside MCP message limits. */
export const MAX_TOOL_OUTPUT_CHARS = 200_000;

export function jsonResult(data: unknown): ToolResult {
  // JSON.stringify(undefined) returns undefined, not a string.
  let text = JSON.stringify(data, null, 2) ?? "null";
  if (text.length > MAX_TOOL_OUTPUT_CHARS) {
    text =
      text.slice(0, MAX_TOOL_OUTPUT_CHARS) +
      `\n\n[Output truncated at ${MAX_TOOL_OUTPUT_CHARS} characters. Narrow the query - fewer items, a shorter date range, or fewer metrics - to get complete JSON.]`;
  }
  return { content: [{ type: "text", text }] };
}
