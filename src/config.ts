import { ConfigError } from "./errors.js";
import type { Tier } from "./gate.js";

export interface Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  writeTier: Tier;
  defaultAccountId: string | undefined;
}

const TIERS = new Set(["read", "safe", "spend"]);

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const missing = ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_REFRESH_TOKEN"].filter(
    (k) => !env[k]
  );
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required env vars: ${missing.join(", ")}. ` +
        `Run \`npx mcp-server-reddit-ads auth\` for a guided one-time setup that produces all three.`
    );
  }
  const tier = env.REDDIT_ADS_WRITE_TIER ?? "read";
  if (!TIERS.has(tier)) {
    throw new ConfigError(`REDDIT_ADS_WRITE_TIER must be one of: read, safe, spend (got '${tier}')`);
  }
  return {
    clientId: env.REDDIT_CLIENT_ID!,
    clientSecret: env.REDDIT_CLIENT_SECRET!,
    refreshToken: env.REDDIT_REFRESH_TOKEN!,
    writeTier: tier as Tier,
    defaultAccountId: env.REDDIT_ADS_ACCOUNT_ID,
  };
}
