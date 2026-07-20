import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type ToolContext } from "./types.js";

export function registerStatusTool(
  server: McpServer,
  ctx: ToolContext,
  toolCounts: () => { registered: number; hidden: number }
): string[] {
  server.registerTool(
    "get_server_status",
    {
      description:
        "Diagnose the server: Reddit Ads API connectivity, configured write tier, how many tools that tier " +
        "hides, and the default account. Start here when something is not working.",
      inputSchema: {},
    },
    async () => {
      const status: Record<string, unknown> = {
        server: { name: "mcp-server-reddit-ads", version: "0.4.0" },
        write_tier: ctx.config.writeTier,
        tools: toolCounts(),
        default_account_id: ctx.config.defaultAccountId ?? null,
      };
      try {
        const accounts = await ctx.client.getAccounts();
        status.api = { ok: true, accessible_accounts: accounts.length };
      } catch (e) {
        status.api = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      return jsonResult(status);
    }
  );
  return ["get_server_status"];
}
