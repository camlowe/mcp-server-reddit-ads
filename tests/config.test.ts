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
      missingCredentials: [],
    });
  });

  it("accepts tier and default account", () => {
    const c = loadConfig({ ...base, REDDIT_ADS_WRITE_TIER: "spend", REDDIT_ADS_ACCOUNT_ID: "a2_x" });
    expect(c.writeTier).toBe("spend");
    expect(c.defaultAccountId).toBe("a2_x");
  });

  // Missing credentials must not stop the server from starting: registries and
  // directories spawn it with no env at all to enumerate tools, and an exit
  // there means the server never gets listed. The failure moves to first use.
  it("reports missing creds instead of throwing, so the server can still start", () => {
    expect(() => loadConfig({})).not.toThrow();
    const c = loadConfig({});
    expect(c.missingCredentials).toEqual([
      "REDDIT_CLIENT_ID",
      "REDDIT_CLIENT_SECRET",
      "REDDIT_REFRESH_TOKEN",
    ]);
    expect(c.writeTier).toBe("read");
  });

  it("reports only the creds that are actually absent", () => {
    const c = loadConfig({ REDDIT_CLIENT_ID: "id" });
    expect(c.missingCredentials).toEqual(["REDDIT_CLIENT_SECRET", "REDDIT_REFRESH_TOKEN"]);
  });

  // Still fatal, unlike missing credentials: a typo'd tier must not silently
  // degrade to read while the operator believes writes are enabled.
  it("rejects an invalid tier", () => {
    expect(() => loadConfig({ ...base, REDDIT_ADS_WRITE_TIER: "yolo" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, REDDIT_ADS_WRITE_TIER: "yolo" })).toThrow(
      /REDDIT_ADS_WRITE_TIER must be one of: read, safe, spend/
    );
  });
});
