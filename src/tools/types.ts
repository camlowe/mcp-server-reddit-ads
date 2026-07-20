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
