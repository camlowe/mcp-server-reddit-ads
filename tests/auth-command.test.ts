import { describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, exchangeCode, renderMcpJson, REDIRECT_URI } from "../src/auth-command.js";

describe("buildAuthorizeUrl", () => {
  it("requests a permanent grant with the ads scopes and localhost redirect", () => {
    const p = new URL(buildAuthorizeUrl("cid", "st8")).searchParams;
    expect(p.get("client_id")).toBe("cid");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("state")).toBe("st8");
    expect(p.get("duration")).toBe("permanent");
    expect(p.get("scope")).toBe("adsread adsedit read");
    expect(p.get("redirect_uri")).toBe(REDIRECT_URI);
  });
});

describe("exchangeCode", () => {
  it("posts with Basic auth, authorization_code grant, and matching redirect_uri", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ refresh_token: "rt", scope: "read adsread adsedit" }), { status: 200 }));
    const out = await exchangeCode("cid", "cs", "THECODE", f);
    expect(out.refreshToken).toBe("rt");
    expect(out.scopes).toBe("read adsread adsedit");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://www.reddit.com/api/v1/access_token");
    expect(init.headers.Authorization).toBe("Basic " + Buffer.from("cid:cs").toString("base64"));
    const body = String(init.body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=THECODE");
    expect(decodeURIComponent(body)).toContain(`redirect_uri=${REDIRECT_URI}`);
  });

  it("surfaces invalid_grant errors from Reddit", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(exchangeCode("cid", "cs", "bad", f)).rejects.toThrow(/invalid_grant/);
  });
});

describe("renderMcpJson", () => {
  it("produces a valid .mcp.json block with all three credentials", () => {
    const text = renderMcpJson("cid", "cs", "rt");
    const parsed = JSON.parse(text);
    const env = parsed.mcpServers["reddit-ads"].env;
    expect(env.REDDIT_CLIENT_ID).toBe("cid");
    expect(env.REDDIT_CLIENT_SECRET).toBe("cs");
    expect(env.REDDIT_REFRESH_TOKEN).toBe("rt");
  });
});
