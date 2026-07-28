import { missingCredentials } from "./auth.js";
import { ConfigError } from "./errors.js";
import type { Tier } from "./gate.js";

export interface Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  writeTier: Tier;
  defaultAccountId: string | undefined;
  /**
   * Env var names for credentials that were absent. Empty when fully configured,
   * and omitted entirely by callers that construct a Config directly. Missing
   * credentials are reported rather than fatal so the server can start and list
   * its tools for registry introspection; TokenManager rejects on first use.
   */
  missingCredentials?: string[];
}

const TIERS = new Set(["read", "safe", "spend"]);

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // An invalid tier still throws: silently falling back to read would hide a
  // typo that the operator believes has granted write access.
  const tier = env.REDDIT_ADS_WRITE_TIER ?? "read";
  if (!TIERS.has(tier)) {
    throw new ConfigError(`REDDIT_ADS_WRITE_TIER must be one of: read, safe, spend (got '${tier}')`);
  }
  const credentials = {
    clientId: env.REDDIT_CLIENT_ID ?? "",
    clientSecret: env.REDDIT_CLIENT_SECRET ?? "",
    refreshToken: env.REDDIT_REFRESH_TOKEN ?? "",
  };
  return {
    ...credentials,
    writeTier: tier as Tier,
    defaultAccountId: env.REDDIT_ADS_ACCOUNT_ID,
    missingCredentials: missingCredentials(credentials),
  };
}
