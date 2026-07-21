import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ConfigError } from "./errors.js";

export interface Creds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export type ConfigTarget = "code" | "desktop";

export interface PlatformEnv {
  platform: NodeJS.Platform;
  homedir: string;
  cwd: string;
  appData?: string;
}

type Obj = Record<string, unknown>;

function asObject(value: unknown): Obj {
  return value !== null && typeof value === "object" ? { ...(value as Obj) } : {};
}

/**
 * Return a new config object with the reddit-ads server entry created or refreshed.
 * Other servers are left untouched. An existing entry keeps its command, args, and
 * any extra env (account id, write tier); only the three credentials are replaced.
 */
export function patchConfig(existing: unknown, creds: Creds): Obj {
  const cfg = asObject(existing);
  const servers = asObject(cfg.mcpServers);
  const prev = servers["reddit-ads"];

  const credEnv = {
    REDDIT_CLIENT_ID: creds.clientId,
    REDDIT_CLIENT_SECRET: creds.clientSecret,
    REDDIT_REFRESH_TOKEN: creds.refreshToken,
  };

  const entry = prev
    ? { ...asObject(prev), env: { ...asObject(asObject(prev).env), ...credEnv } }
    : {
        command: "npx",
        args: ["-y", "mcp-server-reddit-ads"],
        env: { ...credEnv, REDDIT_ADS_WRITE_TIER: "read" },
      };

  cfg.mcpServers = { ...servers, "reddit-ads": entry };
  return cfg;
}

export interface WriteResult {
  path: string;
  backedUp: boolean;
}

/**
 * Patch the reddit-ads entry into the config file at `path`, creating the file (and
 * any missing parent directories) if needed. An existing file is copied to
 * `<path>.bak` first. Throws ConfigError, without touching the file, if the existing
 * contents are not valid JSON.
 */
export function writeConfigFile(path: string, creds: Creds): WriteResult {
  const backedUp = existsSync(path);
  let existing: unknown = {};
  if (backedUp) {
    const raw = readFileSync(path, "utf8");
    try {
      existing = raw.trim() === "" ? {} : JSON.parse(raw);
    } catch {
      throw new ConfigError(
        `${path} already exists but is not valid JSON. Fix it or choose the print-only option, then re-run.`
      );
    }
    copyFileSync(path, path + ".bak");
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(patchConfig(existing, creds), null, 2) + "\n");
  return { path, backedUp };
}

/** Where the given MCP client keeps its config, per target and platform. */
export function resolveConfigPath(target: ConfigTarget, env: PlatformEnv): string {
  if (target === "code") return join(env.cwd, ".mcp.json");

  const file = "claude_desktop_config.json";
  switch (env.platform) {
    case "darwin":
      return join(env.homedir, "Library", "Application Support", "Claude", file);
    case "win32":
      return join(env.appData ?? join(env.homedir, "AppData", "Roaming"), "Claude", file);
    default:
      return join(env.homedir, ".config", "Claude", file);
  }
}
