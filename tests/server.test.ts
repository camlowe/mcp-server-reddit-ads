import { describe, expect, it } from "vitest";
import { buildServer, TOOL_COUNT } from "../src/index.js";
import type { Tier } from "../src/gate.js";

function build(writeTier: Tier) {
  return buildServer({
    clientId: "x",
    clientSecret: "x",
    refreshToken: "x",
    writeTier,
    defaultAccountId: undefined,
  });
}

describe("buildServer", () => {
  it("registers the full tool surface at spend tier", async () => {
    const { server, names } = build("spend");
    expect(server).toBeDefined();
    expect(names).toHaveLength(TOOL_COUNT); // 27
    expect(names).toContain("update_ad_url");
    expect(names).toContain("update_ad_comments");
    expect(new Set(names).size).toBe(TOOL_COUNT); // no duplicates
    expect(names).toContain("get_performance_report");
    expect(names).toContain("copy_ads");
    expect(names).toContain("update_targeting");
    expect(names).toContain("get_server_status");
  });

  it("hides all write tools at read tier", async () => {
    const { names } = build("read");
    expect(names).toHaveLength(15);
    expect(names).toContain("get_server_status");
    expect(names).toContain("get_ad_creative");
    expect(names).not.toContain("update_ad_comments");
    expect(names).toContain("get_campaigns");
    expect(names).not.toContain("pause_items");
    expect(names).not.toContain("create_campaign");
    expect(names).not.toContain("copy_ads");
    expect(names).not.toContain("update_budget");
  });

  it("exposes safe tools but hides spend tools at safe tier", async () => {
    const { names } = build("safe");
    expect(names).toHaveLength(22);
    expect(names).toContain("pause_items");
    expect(names).toContain("update_ad_comments");
    expect(names).toContain("create_campaign");
    expect(names).toContain("copy_ads");
    expect(names).not.toContain("enable_items");
    expect(names).not.toContain("update_budget");
    expect(names).not.toContain("update_bid");
    expect(names).not.toContain("update_targeting");
  });
});
