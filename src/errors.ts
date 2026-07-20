export class ConfigError extends Error {}

export class GateError extends Error {}

export class RedditApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly method: string,
    public readonly path: string,
    public readonly body?: string
  ) {
    super(message);
  }
}

/** Render any thrown value as MCP tool-result text. */
export function toToolText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
