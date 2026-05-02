import { Level, Stack, Package } from "./types";

export const LEVEL_ORDER: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

export const VALID_STACKS: ReadonlySet<Stack> = new Set<Stack>(["backend", "frontend"]);

export const VALID_LEVELS: ReadonlySet<Level> = new Set<Level>(["debug", "info", "warn", "error", "fatal"]);

export const BACKEND_PACKAGES: ReadonlySet<string> = new Set([
  "cache", "controller", "cron_job", "dh", "domain", "handler", "repository", "route", "service",
]);

export const FRONTEND_PACKAGES: ReadonlySet<string> = new Set([
  "api", "component", "hook", "page", "state", "style",
]);

export const SHARED_PACKAGES: ReadonlySet<string> = new Set([
  "auth", "config", "middleware", "utils",
]);

export const VALID_PACKAGES: ReadonlySet<Package> = new Set<Package>([
  ...Array.from(BACKEND_PACKAGES),
  ...Array.from(FRONTEND_PACKAGES),
  ...Array.from(SHARED_PACKAGES),
] as Package[]);

export const LOG_API_ENDPOINT = "/evaluation-service/logs";
