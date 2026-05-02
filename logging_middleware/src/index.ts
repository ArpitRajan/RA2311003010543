export { Logger } from "./logger";
export type { Stack, Level, Package, LogPayload, LoggerConfig } from "./types";
export { validateLogParams } from "./validator";
export type { ValidationResult } from "./validator";

import { Logger } from "./logger";
import { Stack, Level, Package, LoggerConfig } from "./types";

const DEFAULT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJhcjExMzJAc3JtaXN0LmVkdS5pbiIsImV4cCI6MTc3NzcwMzI1OSwiaWF0IjoxNzc3NzAyMzU5LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiZGViMDI3NTEtNWY4ZS00OTlmLWFjZjAtM2YwZGQxNTZlY2IxIiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoiYXJwaXQgcmFqYW4iLCJzdWIiOiJlYzc2MzY2My1jMmQyLTQ3YmEtYTMwZS03Y2Q5OWEyMGVlMzAifSwiZW1haWwiOiJhcjExMzJAc3JtaXN0LmVkdS5pbiIsIm5hbWUiOiJhcnBpdCByYWphbiIsInJvbGxObyI6InJhMjMxMTAwMzAxMDU0MyIsImFjY2Vzc0NvZGUiOiJRa2JweEgiLCJjbGllbnRJRCI6ImVjNzYzNjYzLWMyZDItNDdiYS1hMzBlLTdjZDk5YTIwZWUzMCIsImNsaWVudFNlY3JldCI6InRoRFJUV3hLTU13TXlyZlYifQ.oVLMMGm9RWy4C6glzTrI1I8vhcHW52oP8jncAfgoZyk";

let _defaultLogger: Logger | null = null;

export function configureLogger(config: LoggerConfig): void {
  _defaultLogger = new Logger(config);
}

export async function Log(stack: Stack, level: Level, pkg: Package, message: string): Promise<void> {
  if (!_defaultLogger) {
    _defaultLogger = new Logger({
      serverUrl: "http://20.207.122.201",
      authToken: DEFAULT_TOKEN,
      consoleOutput: true,
    });
  }
  return _defaultLogger.Log(stack, level, pkg, message);
}
