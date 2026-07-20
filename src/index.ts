import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TokenManager } from "./auth.js";
import { isAllowed } from "./gate.js";
import { RedditAdsClient } from "./client.js";
import type { Config } from "./config.js";
import type { ToolContext } from "./tools/types.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerEntityTools } from "./tools/entities.js";
import { registerReportTools } from "./tools/reports.js";
import { registerTargetingTools } from "./tools/targeting.js";
import { registerCreateTools } from "./tools/create.js";
import { registerManageTools } from "./tools/manage.js";
import { registerWorkflowTools } from "./tools/workflows.js";
import { registerSpendTools } from "./tools/spend.js";

export const TOOL_COUNT = 23;

export function buildServer(config: Config): { server: McpServer; names: string[] } {
  const tokens = new TokenManager(config);
  const client = new RedditAdsClient(tokens);
  const ctx: ToolContext = { client, config };
  const server = new McpServer(
    { name: "mcp-server-reddit-ads", version: "0.2.0" },
    { capabilities: { tools: {} } }
  );
  // Tools above the configured tier are not registered at all: the client never
  // sees them, which saves context and shrinks the injection surface. The
  // assertAllowed call inside each write handler stays as defense-in-depth.
  const names = [
    ...registerAccountTools(server, ctx),
    ...registerEntityTools(server, ctx),
    ...registerReportTools(server, ctx),
    ...registerTargetingTools(server, ctx),
    ...(isAllowed("safe", config.writeTier)
      ? [
          ...registerCreateTools(server, ctx),
          ...registerManageTools(server, ctx),
          ...registerWorkflowTools(server, ctx),
        ]
      : []),
    ...(isAllowed("spend", config.writeTier) ? registerSpendTools(server, ctx) : []),
  ];
  return { server, names };
}
