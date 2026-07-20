import { describe, expect, it, vi } from "vitest";
import { TokenManager } from "../src/auth.js";

const cfg = { clientId: "cid", clientSecret: "cs", refreshToken: "rt0" };

function fetchReturning(json: unknown, status = 200) {
  // Fresh Response per call: a Response body is a one-shot stream and this
  // helper is reused across re-fetch (expiry/rotation) cases.
  return vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } })
  );
}

describe("TokenManager", () => {
  it("exchanges the refresh token with HTTP Basic auth and caches until expiry", async () => {
    const f = fetchReturning({ access_token: "at1", expires_in: 3600 });
    const tm = new TokenManager(cfg, f);
    expect(await tm.getAccessToken()).toBe("at1");
    expect(await tm.getAccessToken()).toBe("at1");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://www.reddit.com/api/v1/access_token");
    expect(init.headers.Authorization).toBe("Basic " + Buffer.from("cid:cs").toString("base64"));
    expect(init.headers["User-Agent"]).toBeTruthy();
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(String(init.body)).toContain("refresh_token=rt0");
  });

  it("re-fetches after expiry", async () => {
    const f = fetchReturning({ access_token: "at1", expires_in: 0 });
    const tm = new TokenManager(cfg, f);
    await tm.getAccessToken();
    await tm.getAccessToken();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("adopts a rotated refresh token and warns on stderr", async () => {
    const f = fetchReturning({ access_token: "at1", expires_in: 0, refresh_token: "rt1" });
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const tm = new TokenManager(cfg, f);
    await tm.getAccessToken();
    await tm.getAccessToken();
    expect(String(f.mock.calls[1]![1].body)).toContain("refresh_token=rt1");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("rotated"));
    warn.mockRestore();
  });

  it("throws a useful error when the exchange fails", async () => {
    const f = fetchReturning({ error: "invalid_grant" }, 400);
    const tm = new TokenManager(cfg, f);
    await expect(tm.getAccessToken()).rejects.toThrow(/invalid_grant|token exchange failed/i);
  });
});
