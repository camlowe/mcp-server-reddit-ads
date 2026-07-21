import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError } from "../src/errors.js";
import { writeConfigFile } from "../src/mcp-config.js";

const CREDS = { clientId: "cid", clientSecret: "cs", refreshToken: "rt" };
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mcpcfg-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeConfigFile", () => {
  it("creates a new file (and missing parent dirs) with no backup", () => {
    const path = join(dir, "nested", ".mcp.json");
    const result = writeConfigFile(path, CREDS);
    expect(result).toEqual({ path, backedUp: false });
    const written = JSON.parse(readFileSync(path, "utf8"));
    expect(written.mcpServers["reddit-ads"].env.REDDIT_REFRESH_TOKEN).toBe("rt");
    expect(existsSync(path + ".bak")).toBe(false);
  });

  it("backs up an existing file and preserves unrelated servers", () => {
    const path = join(dir, ".mcp.json");
    const original = JSON.stringify({ mcpServers: { other: { command: "foo" } } });
    writeFileSync(path, original);

    const result = writeConfigFile(path, CREDS);
    expect(result.backedUp).toBe(true);
    expect(readFileSync(path + ".bak", "utf8")).toBe(original);

    const written = JSON.parse(readFileSync(path, "utf8"));
    expect(written.mcpServers.other).toEqual({ command: "foo" });
    expect(written.mcpServers["reddit-ads"].env.REDDIT_CLIENT_ID).toBe("cid");
  });

  it("refuses to overwrite a file whose JSON is invalid", () => {
    const path = join(dir, ".mcp.json");
    writeFileSync(path, "{ not valid json ");
    expect(() => writeConfigFile(path, CREDS)).toThrow(ConfigError);
    expect(readFileSync(path, "utf8")).toBe("{ not valid json ");
    expect(existsSync(path + ".bak")).toBe(false);
  });
});
