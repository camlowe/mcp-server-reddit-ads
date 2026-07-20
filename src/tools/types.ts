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

export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
