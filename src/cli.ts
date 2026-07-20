#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./index.js";

async function main() {
  if (process.argv[2] === "auth") {
    const { runAuthCommand } = await import("./auth-command.js");
    await runAuthCommand();
    return;
  }
  const config = loadConfig();
  const { server, names } = buildServer(config);
  console.error(
    `[mcp-server-reddit-ads] ${names.length} tools registered; write tier: ${config.writeTier}` +
      (config.writeTier === "read" ? " (writes disabled - set REDDIT_ADS_WRITE_TIER=safe|spend to enable)" : "")
  );
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(`[mcp-server-reddit-ads] fatal: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
