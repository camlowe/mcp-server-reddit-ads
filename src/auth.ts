export const USER_AGENT = "mcp-server-reddit-ads (+https://github.com/camlowe/mcp-server-reddit-ads)";
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const SKEW_MS = 60_000;

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export class TokenManager {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshToken: string;

  constructor(
    private readonly cfg: AuthConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.refreshToken = cfg.refreshToken;
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - SKEW_MS) return this.accessToken;
    const resp = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.refreshToken }),
    });
    const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    const accessToken = data.access_token;
    if (!resp.ok || typeof accessToken !== "string") {
      throw new Error(
        `Reddit token exchange failed (HTTP ${resp.status}): ${JSON.stringify(data)}. ` +
          `If this persists, re-run \`npx mcp-server-reddit-ads auth\` to mint a fresh refresh token.`
      );
    }
    this.accessToken = accessToken;
    this.expiresAt = Date.now() + Number(data.expires_in ?? 3600) * 1000;
    if (typeof data.refresh_token === "string" && data.refresh_token !== this.refreshToken) {
      this.refreshToken = data.refresh_token;
      console.error(
        "[auth] Reddit rotated the refresh token. Update REDDIT_REFRESH_TOKEN in your MCP config to persist across restarts."
      );
    }
    return this.accessToken;
  }
}
