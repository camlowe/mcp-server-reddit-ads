#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { missingCredentialsMessage } from "./auth.js";
import { loadConfig } from "./config.js";
import { buildServer, TOOL_COUNT } from "./index.js";

async function main() {
  if (process.argv[2] === "auth") {
    const { runAuthCommand } = await import("./auth-command.js");
    await runAuthCommand();
    return;
  }
  const config = loadConfig();
  const { server, names } = buildServer(config);
  const hidden = TOOL_COUNT - names.length;
  console.error(
    `[mcp-server-reddit-ads] ${names.length} tools registered; write tier: ${config.writeTier}` +
      (hidden > 0 ? ` (${hidden} write tools hidden - raise REDDIT_ADS_WRITE_TIER to expose them)` : "")
  );
  // Missing credentials are a warning, not a fatal: starting anyway lets a client
  // or registry list the tools before setup is finished. Every call will fail
  // until they are set, so say so loudly.
  const missing = config.missingCredentials ?? [];
  if (missing.length > 0) {
    console.error(
      `[mcp-server-reddit-ads] WARNING: ${missingCredentialsMessage(missing)} ` +
        `Tools are listed but every call will fail until these are set.`
    );
  }
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(`[mcp-server-reddit-ads] fatal: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
