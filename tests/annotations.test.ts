import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/index.js";
import type { Tier } from "../src/gate.js";

// Goes through a real MCP client over linked in-memory transports rather than
// reading the server's internals, so this asserts what a client actually
// receives in tools/list. Glama's scoring flagged missing annotations, and the
// hints are only useful if they survive the wire.
async function listTools(writeTier: Tier) {
  const { server } = buildServer({
    clientId: "x",
    clientSecret: "x",
    refreshToken: "x",
    writeTier,
    defaultAccountId: undefined,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  return tools;
}

describe("tool annotations", () => {
  let spendTools: Awaited<ReturnType<typeof listTools>>;

  beforeAll(async () => {
    spendTools = await listTools("spend");
  });

  it("annotates every tool", () => {
    expect(spendTools).toHaveLength(30);
    const bare = spendTools.filter((t) => !t.annotations).map((t) => t.name);
    expect(bare).toEqual([]);
  });

  it("marks reads read-only and writes not", () => {
    const readOnly = spendTools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly).toHaveLength(18);
    expect(readOnly).toContain("get_campaigns");
    expect(readOnly).toContain("compare_ads");
    // A write tool claiming readOnlyHint would tell a client it is safe to call
    // speculatively, which for update_budget means unreviewed spend changes.
    expect(readOnly).not.toContain("update_budget");
    expect(readOnly).not.toContain("pause_items");
    expect(readOnly).not.toContain("create_campaign");
  });

  it("declares every tool as reaching an external system", () => {
    const closed = spendTools.filter((t) => t.annotations?.openWorldHint !== true);
    expect(closed.map((t) => t.name)).toEqual([]);
  });

  it("treats creates as additive and non-idempotent", () => {
    for (const name of ["create_campaign", "create_ad_group", "create_ad", "copy_ads"]) {
      const a = spendTools.find((t) => t.name === name)?.annotations;
      expect(a?.destructiveHint, name).toBe(false);
      expect(a?.idempotentHint, name).toBe(false);
    }
  });

  it("treats pausing as reversible but resuming spend as destructive", () => {
    expect(spendTools.find((t) => t.name === "pause_items")?.annotations?.destructiveHint).toBe(
      false
    );
    expect(spendTools.find((t) => t.name === "enable_items")?.annotations?.destructiveHint).toBe(
      true
    );
  });

  it("marks overwriting updates destructive and idempotent", () => {
    for (const name of ["update_budget", "update_bid", "update_targeting", "update_ad_url"]) {
      const a = spendTools.find((t) => t.name === name)?.annotations;
      expect(a?.destructiveHint, name).toBe(true);
      expect(a?.idempotentHint, name).toBe(true);
    }
  });

  it("exposes only read-only tools at read tier", async () => {
    const tools = await listTools("read");
    expect(tools).toHaveLength(18);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });
});
