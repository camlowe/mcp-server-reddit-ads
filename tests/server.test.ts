import { describe, expect, it } from "vitest";
import { buildServer, TOOL_COUNT } from "../src/index.js";

describe("buildServer", () => {
  it("registers exactly the designed tool surface", async () => {
    const { server, names } = buildServer({
      clientId: "x",
      clientSecret: "x",
      refreshToken: "x",
      writeTier: "read",
      defaultAccountId: undefined,
    });
    expect(server).toBeDefined();
    expect(names).toHaveLength(TOOL_COUNT); // 23
    expect(new Set(names).size).toBe(TOOL_COUNT); // no duplicates
    expect(names).toContain("get_performance_report");
    expect(names).toContain("copy_ads");
    expect(names).toContain("update_targeting");
  });
});
