import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { ConfigError } from "../src/errors.js";

const base = {
  REDDIT_CLIENT_ID: "id",
  REDDIT_CLIENT_SECRET: "secret",
  REDDIT_REFRESH_TOKEN: "rt",
};

describe("loadConfig", () => {
  it("parses a minimal valid env with defaults", () => {
    const c = loadConfig(base);
    expect(c).toEqual({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "rt",
      writeTier: "read",
      defaultAccountId: undefined,
    });
  });

  it("accepts tier and default account", () => {
    const c = loadConfig({ ...base, REDDIT_ADS_WRITE_TIER: "spend", REDDIT_ADS_ACCOUNT_ID: "a2_x" });
    expect(c.writeTier).toBe("spend");
    expect(c.defaultAccountId).toBe("a2_x");
  });

  it("fails with a pointer to the auth command when creds are missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/npx mcp-server-reddit-ads auth/);
    expect(() => loadConfig({})).toThrow(/REDDIT_CLIENT_ID/);
  });

  it("rejects an invalid tier", () => {
    expect(() => loadConfig({ ...base, REDDIT_ADS_WRITE_TIER: "yolo" })).toThrow(
      /REDDIT_ADS_WRITE_TIER must be one of: read, safe, spend/
    );
  });
});
