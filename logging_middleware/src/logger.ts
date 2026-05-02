import { Stack, Level, Package, LogPayload, LoggerConfig } from "./types";
import { LOG_API_ENDPOINT, LEVEL_ORDER } from "./constants";
import { validateLogParams } from "./validator";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  fatal: "\x1b[35m",
} as const;

function levelColour(level: Level): string {
  return ANSI[level] ?? ANSI.reset;
}

function timestamp(): string {
  return new Date().toISOString();
}

export class Logger {
  private readonly serverUrl: string;
  private readonly authToken: string | undefined;
  private readonly minLevelIndex: number;
  private readonly consoleOutput: boolean;

  constructor(config: LoggerConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, "");
    this.authToken = config.authToken;
    this.minLevelIndex = LEVEL_ORDER[config.minLevel ?? "debug"];
    this.consoleOutput = config.consoleOutput ?? true;
  }

  async Log(stack: Stack, level: Level, pkg: Package, message: string): Promise<void> {
    const validation = validateLogParams(stack, level, pkg, message);
    if (!validation.valid) {
      console.error(`${ANSI.error}${ANSI.bold}[Logger] Invalid log call – ${validation.errors.join(" | ")}${ANSI.reset}`);
      return;
    }

    if (this.consoleOutput) {
      this._printLocal(stack, level, pkg, message);
    }

    if (LEVEL_ORDER[level] < this.minLevelIndex) return;

    await this._sendToServer({ stack, level, package: pkg, message });
  }

  async debug(stack: Stack, pkg: Package, message: string): Promise<void> {
    return this.Log(stack, "debug", pkg, message);
  }
  async info(stack: Stack, pkg: Package, message: string): Promise<void> {
    return this.Log(stack, "info", pkg, message);
  }
  async warn(stack: Stack, pkg: Package, message: string): Promise<void> {
    return this.Log(stack, "warn", pkg, message);
  }
  async error(stack: Stack, pkg: Package, message: string): Promise<void> {
    return this.Log(stack, "error", pkg, message);
  }
  async fatal(stack: Stack, pkg: Package, message: string): Promise<void> {
    return this.Log(stack, "fatal", pkg, message);
  }

  private _printLocal(stack: Stack, level: Level, pkg: Package, message: string): void {
    const colour = levelColour(level);
    const ts = timestamp();
    const levelTag = `[${level.toUpperCase().padEnd(5)}]`;
    const meta = `${ANSI.dim}${ts} ${stack}::${pkg}${ANSI.reset}`;
    console.log(`${meta} ${colour}${ANSI.bold}${levelTag}${ANSI.reset} ${message}`);
  }

  private async _sendToServer(payload: LogPayload): Promise<void> {
    const url = `${this.serverUrl}${LOG_API_ENDPOINT}`;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.authToken) {
        headers["Authorization"] = this.authToken.startsWith("Bearer ")
          ? this.authToken
          : `Bearer ${this.authToken}`;
      }
      const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      if (!response.ok) {
        const body = await response.text().catch(() => "(no body)");
        console.error(`${ANSI.error}[Logger] Remote /logs returned HTTP ${response.status}: ${body}${ANSI.reset}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${ANSI.error}[Logger] Failed to reach remote log server: ${msg}${ANSI.reset}`);
    }
  }
}
