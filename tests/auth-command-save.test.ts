import { describe, expect, it, vi } from "vitest";
import { promptAndSave, type SaveDeps } from "../src/auth-command.js";

const CREDS = { clientId: "cid", clientSecret: "cs", refreshToken: "secret-token" };

function makeDeps(overrides: Partial<SaveDeps> = {}): { deps: SaveDeps; output: string[] } {
  const output: string[] = [];
  const deps: SaveDeps = {
    isInteractive: true,
    ask: vi.fn().mockResolvedValue("1"),
    save: vi.fn().mockReturnValue({ path: "/proj/.mcp.json", backedUp: false }),
    labelFor: (t) => (t === "code" ? "/proj/.mcp.json" : "/home/x/desktop.json"),
    print: (line) => output.push(line),
    ...overrides,
  };
  return { deps, output };
}

describe("promptAndSave", () => {
  it("writes the Claude Code config on choice 1 without printing the token", async () => {
    const { deps, output } = makeDeps({ ask: vi.fn().mockResolvedValue("1") });
    await promptAndSave(CREDS, deps);
    expect(deps.save).toHaveBeenCalledWith("code");
    const text = output.join("\n");
    expect(text).toContain("/proj/.mcp.json");
    expect(text).not.toContain("secret-token");
  });

  it("defaults to Claude Code when the user just presses Enter", async () => {
    const { deps } = makeDeps({ ask: vi.fn().mockResolvedValue("") });
    await promptAndSave(CREDS, deps);
    expect(deps.save).toHaveBeenCalledWith("code");
  });

  it("writes the Claude Desktop config on choice 2", async () => {
    const { deps } = makeDeps({ ask: vi.fn().mockResolvedValue("2") });
    await promptAndSave(CREDS, deps);
    expect(deps.save).toHaveBeenCalledWith("desktop");
  });

  it("prints the full block and writes nothing on choice 3", async () => {
    const { deps, output } = makeDeps({ ask: vi.fn().mockResolvedValue("3") });
    await promptAndSave(CREDS, deps);
    expect(deps.save).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain("secret-token");
  });

  it("prints the block without prompting when not interactive", async () => {
    const { deps, output } = makeDeps({ isInteractive: false });
    await promptAndSave(CREDS, deps);
    expect(deps.ask).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain("secret-token");
  });

  it("falls back to printing the block if the write fails", async () => {
    const save = vi.fn(() => {
      throw new Error("EACCES");
    });
    const { deps, output } = makeDeps({ ask: vi.fn().mockResolvedValue("1"), save });
    await promptAndSave(CREDS, deps);
    const text = output.join("\n");
    expect(text).toContain("EACCES");
    expect(text).toContain("secret-token");
  });
});
