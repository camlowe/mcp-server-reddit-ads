import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWorkflowTools, rewriteQueryParams } from "../src/tools/workflows.js";
import type { ToolContext, ToolResult } from "../src/tools/types.js";
import type { Config } from "../src/config.js";
import type { RedditAdsClient } from "../src/client.js";
import { GateError } from "../src/errors.js";

type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

function setup(tier: Config["writeTier"] = "safe") {
  const client = {
    getAd: vi.fn(),
    createAd: vi.fn().mockResolvedValue({ data: { id: "copy1" } }),
  };
  const config: Config = {
    clientId: "x",
    clientSecret: "x",
    refreshToken: "x",
    writeTier: tier,
    defaultAccountId: "a2_def",
  };
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _def: unknown, cb: Handler) => handlers.set(name, cb),
  } as unknown as McpServer;
  const ctx: ToolContext = { client: client as unknown as RedditAdsClient, config };
  registerWorkflowTools(server, ctx);
  return { client, handlers };
}

const parse = (r: ToolResult) => JSON.parse(r.content[0]!.text);

describe("rewriteQueryParams", () => {
  it("overrides only the named params and preserves the rest", () => {
    const out = rewriteQueryParams(
      "https://x.io/?utm_source=reddit&utm_campaign=GEN-ENT-USA&utm_content=Ad+1",
      { utm_campaign: "remarketing-reddit" }
    );
    const p = new URL(out).searchParams;
    expect(p.get("utm_source")).toBe("reddit");
    expect(p.get("utm_campaign")).toBe("remarketing-reddit");
    expect(p.get("utm_content")).toBe("Ad 1");
  });
});

describe("copy_ads", () => {
  it("is gated at read tier", async () => {
    const { handlers, client } = setup("read");
    await expect(
      handlers.get("copy_ads")!({ source_ad_ids: ["1"], destination_ad_group_id: "g2" })
    ).rejects.toBeInstanceOf(GateError);
    expect(client.createAd).not.toHaveBeenCalled();
  });

  it("copies with rewritten UTM and creates in the destination group", async () => {
    const { handlers, client } = setup();
    client.getAd.mockResolvedValue({
      data: {
        name: "Ad 1",
        post_url: "https://www.reddit.com/r/x/comments/abc/",
        click_url: "https://x.io/?utm_source=reddit&utm_campaign=GEN-ENT-USA&utm_content=Ad+1",
      },
    });
    const out = parse(
      await handlers.get("copy_ads")!({
        source_ad_ids: ["1"],
        destination_ad_group_id: "g2",
        utm_overrides: { utm_campaign: "remarketing-reddit" },
        name_suffix: " (copy)",
      })
    );
    const [acct, body] = client.createAd.mock.calls[0]!;
    expect(acct).toBe("a2_def");
    expect(body.ad_group_id).toBe("g2");
    expect(body.name).toBe("Ad 1 (copy)");
    expect(new URL(body.click_url).searchParams.get("utm_campaign")).toBe("remarketing-reddit");
    expect(new URL(body.click_url).searchParams.get("utm_source")).toBe("reddit");
    expect(out.results[0]).toMatchObject({ source_ad_id: "1", ok: true, new_ad_id: "copy1" });
  });

  it("reports per-item failures without aborting the batch", async () => {
    const { handlers, client } = setup();
    client.getAd.mockImplementation(async (id: string) => {
      if (id === "bad") throw new Error("Reddit resource not found: GET /ads/bad");
      return { data: { name: "Ad", post_url: "https://reddit.com/x" } };
    });
    const out = parse(
      await handlers.get("copy_ads")!({ source_ad_ids: ["1", "bad"], destination_ad_group_id: "g2" })
    );
    expect(out.results).toHaveLength(2);
    expect(out.results[0].ok).toBe(true);
    expect(out.results[1]).toMatchObject({ source_ad_id: "bad", ok: false });
    expect(client.createAd).toHaveBeenCalledTimes(1);
  });
});
