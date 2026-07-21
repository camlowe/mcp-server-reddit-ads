import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { patchConfig, resolveConfigPath } from "../src/mcp-config.js";

const CREDS = { clientId: "cid", clientSecret: "cs", refreshToken: "rt" };

type Entry = { command?: string; args?: unknown; env: Record<string, string> };
const servers = (cfg: Record<string, unknown>) => cfg.mcpServers as Record<string, Entry>;
const entryOf = (cfg: Record<string, unknown>, name = "reddit-ads"): Entry => servers(cfg)[name]!;

describe("patchConfig", () => {
  it("creates the reddit-ads entry with the npx template when the file is empty", () => {
    const entry = entryOf(patchConfig({}, CREDS));
    expect(entry.command).toBe("npx");
    expect(entry.args).toEqual(["-y", "mcp-server-reddit-ads"]);
    expect(entry.env).toEqual({
      REDDIT_CLIENT_ID: "cid",
      REDDIT_CLIENT_SECRET: "cs",
      REDDIT_REFRESH_TOKEN: "rt",
      REDDIT_ADS_WRITE_TIER: "read",
    });
  });

  it("updates only the three credentials on an existing entry, preserving command, args, and extra env", () => {
    const existing = {
      mcpServers: {
        "reddit-ads": {
          command: "node",
          args: ["/path/dist/cli.js"],
          env: {
            REDDIT_CLIENT_ID: "old",
            REDDIT_CLIENT_SECRET: "old",
            REDDIT_REFRESH_TOKEN: "old",
            REDDIT_ADS_WRITE_TIER: "spend",
            REDDIT_ADS_ACCOUNT_ID: "a2_keepme",
          },
        },
      },
    };
    const entry = entryOf(patchConfig(existing, CREDS));
    expect(entry.command).toBe("node");
    expect(entry.args).toEqual(["/path/dist/cli.js"]);
    expect(entry.env.REDDIT_CLIENT_ID).toBe("cid");
    expect(entry.env.REDDIT_CLIENT_SECRET).toBe("cs");
    expect(entry.env.REDDIT_REFRESH_TOKEN).toBe("rt");
    expect(entry.env.REDDIT_ADS_WRITE_TIER).toBe("spend");
    expect(entry.env.REDDIT_ADS_ACCOUNT_ID).toBe("a2_keepme");
  });

  it("leaves other MCP servers untouched", () => {
    const existing = { mcpServers: { other: { command: "foo", args: ["bar"] } } };
    const out = servers(patchConfig(existing, CREDS));
    expect(out.other).toEqual({ command: "foo", args: ["bar"] });
    expect(out["reddit-ads"]).toBeDefined();
  });
});

describe("resolveConfigPath", () => {
  it("resolves Claude Code to .mcp.json in the current directory", () => {
    const p = resolveConfigPath("code", { platform: "darwin", homedir: "/Users/x", cwd: "/proj" });
    expect(p).toBe(join("/proj", ".mcp.json"));
  });

  it("resolves the Claude Desktop path per platform", () => {
    const mac = resolveConfigPath("desktop", { platform: "darwin", homedir: "/Users/x", cwd: "/proj" });
    expect(mac).toBe(join("/Users/x", "Library", "Application Support", "Claude", "claude_desktop_config.json"));

    const win = resolveConfigPath("desktop", {
      platform: "win32",
      homedir: "C:\\Users\\x",
      cwd: "C:\\proj",
      appData: "C:\\Users\\x\\AppData\\Roaming",
    });
    expect(win).toBe(join("C:\\Users\\x\\AppData\\Roaming", "Claude", "claude_desktop_config.json"));

    const linux = resolveConfigPath("desktop", { platform: "linux", homedir: "/home/x", cwd: "/proj" });
    expect(linux).toBe(join("/home/x", ".config", "Claude", "claude_desktop_config.json"));
  });
});
