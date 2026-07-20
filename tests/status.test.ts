import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStatusTool } from "../src/tools/status.js";
import type { ToolContext, ToolResult } from "../src/tools/types.js";
import type { Config } from "../src/config.js";
import type { RedditAdsClient } from "../src/client.js";

type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

function setup(configOverrides: Partial<Config> = {}) {
  const client = { getAccounts: vi.fn() };
  const config: Config = {
    clientId: "x",
    clientSecret: "x",
    refreshToken: "x",
    writeTier: "read",
    defaultAccountId: undefined,
    ...configOverrides,
  };
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _def: unknown, cb: Handler) => handlers.set(name, cb),
  } as unknown as McpServer;
  const ctx: ToolContext = { client: client as unknown as RedditAdsClient, config };
  const names = registerStatusTool(server, ctx, () => ({ registered: 14, hidden: 10 }));
  return { client, handlers, names };
}

const parse = (r: ToolResult) => JSON.parse(r.content[0]!.text);

describe("get_server_status", () => {
  it("reports tier, tool counts, default account, and API connectivity", async () => {
    const { client, handlers, names } = setup({ defaultAccountId: "a2_def" });
    expect(names).toEqual(["get_server_status"]);
    client.getAccounts.mockResolvedValue([{ id: "a2_def" }, { id: "a2_other" }]);
    const out = parse(await handlers.get("get_server_status")!({}));
    expect(out.write_tier).toBe("read");
    expect(out.tools).toEqual({ registered: 14, hidden: 10 });
    expect(out.default_account_id).toBe("a2_def");
    expect(out.api).toEqual({ ok: true, accessible_accounts: 2 });
  });

  it("reports API failure as data instead of throwing", async () => {
    const { client, handlers } = setup();
    client.getAccounts.mockRejectedValue(new Error("token exchange failed (HTTP 401)"));
    const out = parse(await handlers.get("get_server_status")!({}));
    expect(out.api.ok).toBe(false);
    expect(out.api.error).toContain("token exchange failed");
    expect(out.default_account_id).toBeNull();
  });
});
