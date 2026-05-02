import { configureLogger, Log } from "./index";

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJhcjExMzJAc3JtaXN0LmVkdS5pbiIsImV4cCI6MTc3NzY5OTU3OSwiaWF0IjoxNzc3Njk4Njc5LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiZmMzNDBiNjUtMTE2Mi00MDc2LWE5ZjEtZGFiZjgyMWZlNTc4IiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoiYXJwaXQgcmFqYW4iLCJzdWIiOiJlYzc2MzY2My1jMmQyLTQ3YmEtYTMwZS03Y2Q5OWEyMGVlMzAifSwiZW1haWwiOiJhcjExMzJAc3JtaXN0LmVkdS5pbiIsIm5hbWUiOiJhcnBpdCByYWphbiIsInJvbGxObyI6InJhMjMxMTAwMzAxMDU0MyIsImFjY2Vzc0NvZGUiOiJRa2JweEgiLCJjbGllbnRJRCI6ImVjNzYzNjYzLWMyZDItNDdiYS1hMzBlLTdjZDk5YTIwZWUzMCIsImNsaWVudFNlY3JldCI6InRoRFJUV3hLTU13TXlyZlYifQ.CEutHtFLtU3ErqKNocP8Bo0X7W-iTP6fsbrJ4SYZG4o";

configureLogger({
  serverUrl: "http://20.207.122.201",
  authToken: TOKEN,
  minLevel: "debug",
  consoleOutput: true,
});

(async () => {
  await Log("backend", "error", "handler", "received string, expected bool");
  await Log("backend", "fatal", "service", "Critical database connection failure.");

  await Log("backend", "debug",  "config",      "Loading environment configuration");
  await Log("backend", "info",   "route",        "HTTP server listening on port 3000");
  await Log("backend", "info",   "middleware",   "Request received: GET /api/users");
  await Log("backend", "debug",  "repository",   "Executing SQL: SELECT * FROM users WHERE id=$1");
  await Log("backend", "info",   "service",      "Business rule validated – proceeding with transaction");
  await Log("backend", "warn",   "cache",        "Cache miss for key 'user:42' – falling back to DB");
  await Log("backend", "warn",   "controller",   "Deprecated API endpoint /v1/ping called");
  await Log("backend", "error",  "handler",      "Unhandled exception in POST /api/orders – TypeError");
  await Log("backend", "fatal",  "service",      "Maximum retry attempts reached – shutting down worker");
  await Log("backend", "info",   "auth",         "JWT token issued for userId=99 with 1h expiry");
  await Log("backend", "error",  "auth",         "JWT verification failed – token expired");
  await Log("backend", "info",   "utils",        "Date formatted to ISO-8601 successfully");
  await Log("backend", "info",   "cron_job",     "Scheduled task 'cleanup_sessions' triggered");
  await Log("backend", "warn",   "dh",           "Data hydration skipped for optional field 'avatar'");
  await Log("backend", "debug",  "domain",       "Domain entity User constructed with id=7");

  await Log("frontend", "info",  "page",       "Dashboard page mounted");
  await Log("frontend", "debug", "component",  "Navbar re-render triggered by prop change: theme");
  await Log("frontend", "info",  "api",        "GET /api/notifications returned 200 – 5 items");
  await Log("frontend", "warn",  "state",      "Redux store updated with stale data – force refresh recommended");
  await Log("frontend", "error", "hook",       "useAuth: failed to refresh session token");
  await Log("frontend", "debug", "style",      "Theme toggled to dark mode");
})();
