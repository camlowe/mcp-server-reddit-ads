import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { USER_AGENT } from "./auth.js";

export const REDIRECT_URI = "http://localhost:8080";
const PORT = 8080;
const AUTHORIZE_URL = "https://www.reddit.com/api/v1/authorize";
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const SCOPES = "adsread adsedit read";
const CALLBACK_TIMEOUT_MS = 10 * 60 * 1000;

const PORTAL_HINT =
  "Create the app in the Reddit Ads developer portal (Business settings > Developer Applications). " +
  "reddit.com/prefs/apps silently rejects new apps under the Responsible Builder Policy (early 2026). " +
  `The app's redirect URI must be exactly ${REDIRECT_URI}.`;

export function buildAuthorizeUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    state,
    redirect_uri: REDIRECT_URI,
    duration: "permanent",
    scope: SCOPES,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ refreshToken: string; scopes: string }> {
  const resp = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok || typeof data.refresh_token !== "string") {
    throw new Error(
      `Token exchange failed (HTTP ${resp.status}): ${JSON.stringify(data)}. ` +
        `A redirect_uri mismatch is the usual cause - it must be exactly ${REDIRECT_URI} on both the app and this request.`
    );
  }
  return { refreshToken: data.refresh_token, scopes: typeof data.scope === "string" ? data.scope : SCOPES };
}

export function renderMcpJson(clientId: string, clientSecret: string, refreshToken: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        "reddit-ads": {
          command: "npx",
          args: ["-y", "mcp-server-reddit-ads"],
          env: {
            REDDIT_CLIENT_ID: clientId,
            REDDIT_CLIENT_SECRET: clientSecret,
            REDDIT_REFRESH_TOKEN: refreshToken,
            REDDIT_ADS_WRITE_TIER: "read",
          },
        },
      },
    },
    null,
    2
  );
}

function tryOpenBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const child = spawn(cmd, [url], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* opening the browser is best-effort */
  }
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Wait for the OAuth redirect on localhost, returning the authorization code. */
function awaitCallback(expectedState: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const done = (message: string) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<html><body><h3>${message}</h3><p>You can close this tab and return to the terminal.</p></body></html>`);
        server.close();
      };
      if (error) {
        done(`Authorization failed: ${error}`);
        reject(new Error(`Reddit returned an error: ${error}. ${PORTAL_HINT}`));
        return;
      }
      if (!code || state !== expectedState) {
        done("Authorization state mismatch.");
        reject(new Error("State mismatch or missing code - possible CSRF or a stale callback. Re-run the command."));
        return;
      }
      done("Authorized.");
      resolve(code);
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for the authorization callback (10 minutes)."));
    }, CALLBACK_TIMEOUT_MS);
    timer.unref();

    server.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${PORT} is in use - free it and re-run. The port cannot change: it must match the redirect URI registered on your Reddit app.`
          )
        );
      } else {
        reject(e);
      }
    });
    server.listen(PORT);
  });
}

export async function runAuthCommand(): Promise<void> {
  const clientId = process.env.REDDIT_CLIENT_ID || (await prompt("Reddit app client ID: "));
  const clientSecret = process.env.REDDIT_CLIENT_SECRET || (await prompt("Reddit app client secret: "));
  if (!clientId || !clientSecret) {
    throw new Error(`Client ID and secret are required. ${PORTAL_HINT}`);
  }

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = buildAuthorizeUrl(clientId, state);

  console.error("\nOpen this URL in your browser to authorize (attempting to open it now):\n");
  console.error(authorizeUrl + "\n");
  tryOpenBrowser(authorizeUrl);
  console.error(`Waiting for the callback on ${REDIRECT_URI} ...`);

  const code = await awaitCallback(state);
  const { refreshToken, scopes } = await exchangeCode(clientId, clientSecret, code);

  console.error(`\nSuccess. Granted scopes: ${scopes}\n`);
  console.error("Paste this into your .mcp.json (REDDIT_ADS_WRITE_TIER defaults to read; set safe or spend to enable writes):\n");
  console.error(renderMcpJson(clientId, clientSecret, refreshToken));
}
