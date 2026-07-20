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
    expect(names).toHaveLength(TOOL_COUNT); // 23
    expect(new Set(names).size).toBe(TOOL_COUNT); // no duplicates
    expect(names).toContain("get_performance_report");
    expect(names).toContain("copy_ads");
    expect(names).toContain("update_targeting");
  });

  it("hides all write tools at read tier", async () => {
    const { names } = build("read");
    expect(names).toHaveLength(13);
    expect(names).toContain("get_campaigns");
    expect(names).not.toContain("pause_items");
    expect(names).not.toContain("create_campaign");
    expect(names).not.toContain("copy_ads");
    expect(names).not.toContain("update_budget");
  });

  it("exposes safe tools but hides spend tools at safe tier", async () => {
    const { names } = build("safe");
    expect(names).toHaveLength(19);
    expect(names).toContain("pause_items");
    expect(names).toContain("create_campaign");
    expect(names).toContain("copy_ads");
    expect(names).not.toContain("enable_items");
    expect(names).not.toContain("update_budget");
    expect(names).not.toContain("update_bid");
    expect(names).not.toContain("update_targeting");
  });
});
