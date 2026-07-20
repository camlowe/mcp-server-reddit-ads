/**
 * Manual pre-release live smoke test. NEVER run in CI.
 *
 * Reads real credentials from the environment and exercises the verified request
 * shapes against the live Reddit Ads API, including one harmless no-op write
 * (re-pausing an already-paused ad) to prove PATCH works.
 *
 *   REDDIT_CLIENT_ID=... REDDIT_CLIENT_SECRET=... REDDIT_REFRESH_TOKEN=... \
 *   REDDIT_ADS_ACCOUNT_ID=a2_... npm run smoke
 */
import { loadConfig } from "../src/config.js";
import { TokenManager } from "../src/auth.js";
import { RedditAdsClient } from "../src/client.js";
import { isoDaysAgo, todayIso } from "../src/dates.js";
import { resolveMetrics } from "../src/metrics.js";

type Entity = Record<string, unknown>;

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new RedditAdsClient(new TokenManager(config));
  const failures: string[] = [];
  const pass = (msg: string) => console.error(`  PASS  ${msg}`);
  const fail = (msg: string) => {
    failures.push(msg);
    console.error(`  FAIL  ${msg}`);
  };

  // 1. Accounts
  const accounts = (await client.getAccounts()) as Entity[];
  console.error(`\n1. get_accounts -> ${accounts.length} account(s): ${accounts.map((a) => a.id).join(", ")}`);
  const accountId = config.defaultAccountId ?? (accounts[0]?.id as string | undefined);
  if (!accountId) {
    fail("no ad account available; set REDDIT_ADS_ACCOUNT_ID or grant access to one");
    return finish(failures);
  }
  pass(`using account ${accountId}`);

  // 2. Campaigns
  const campaigns = (await client.listCampaigns(accountId)).data as Entity[];
  console.error(`\n2. get_campaigns -> ${campaigns.length} campaign(s)`);
  pass("listed campaigns");

  // 3. Report
  const report = await client.report(accountId, {
    fields: resolveMetrics(["spend", "impressions", "clicks"]),
    breakdowns: ["DATE"],
    startDate: isoDaysAgo(7),
    endDate: todayIso(),
  });
  const totalSpend = report.metrics.reduce((sum, row) => sum + Number((row as Entity).spend ?? 0), 0);
  console.error(`\n3. get_performance_report (7 days) -> total spend $${totalSpend.toFixed(2)} across ${report.metrics.length} day(s)`);
  pass("pulled report");

  // 4. Harmless no-op write: re-pause an already-paused ad to prove PATCH works.
  const ads = (await client.listAds(accountId)).data as Entity[];
  const paused = ads.find((a) => a.configured_status === "PAUSED");
  if (!paused) {
    console.error(`\n4. write check -> SKIPPED (no already-paused ad to safely re-pause)`);
  } else {
    const res = (await client.patchAd(paused.id as string, { configured_status: "PAUSED" })) as {
      data?: { configured_status?: unknown };
    };
    console.error(`\n4. write check -> PATCH /ads/${paused.id as string} returned configured_status=${String(res.data?.configured_status)}`);
    if (res.data?.configured_status === "PAUSED") pass("PATCH write confirmed via configured_status");
    else fail("PATCH did not return configured_status=PAUSED");
  }

  finish(failures);
}

function finish(failures: string[]): void {
  console.error(`\n${failures.length === 0 ? "SMOKE PASSED" : `SMOKE FAILED (${failures.length})`}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\nSMOKE FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
