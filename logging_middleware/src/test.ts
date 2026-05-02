import * as http from "http";
import { configureLogger, Log } from "./index";

const CLIENT_ID     = "ec763663-c2d2-47ba-a30e-7cd99a20ee30";
const CLIENT_SECRET = "thDRTWxKMMwMyrfV";
const EMAIL         = "ar1132@srmist.edu.in";
const NAME          = "arpit rajan";
const ROLL_NO       = "ra2311003010543";
const ACCESS_CODE   = "QkbpxH";

function getToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      email: EMAIL, name: NAME, rollNo: ROLL_NO,
      accessCode: ACCESS_CODE, clientID: CLIENT_ID, clientSecret: CLIENT_SECRET,
    });
    const req = http.request({
      hostname: "20.207.122.201", port: 80,
      path: "/evaluation-service/auth", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data) as { access_token: string };
          resolve(parsed.access_token);
        } catch {
          reject(new Error("Failed to parse auth response"));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const token = await getToken();

  configureLogger({
    serverUrl: "http://20.207.122.201",
    authToken: token,
    minLevel: "debug",
    consoleOutput: true,
  });

  await Log("backend", "error",  "handler",    "received string, expected bool");
  await Log("backend", "fatal",  "service",    "Critical db connection failure");
  await Log("backend", "debug",  "config",     "Loading environment config");
  await Log("backend", "info",   "route",      "HTTP server listening on port 3000");
  await Log("backend", "info",   "middleware",  "Request received: GET /api/users");
  await Log("backend", "debug",  "repository", "SQL: SELECT * FROM users WHERE id=$1");
  await Log("backend", "info",   "service",    "Business rule validated");
  await Log("backend", "warn",   "cache",      "Cache miss for user:42");
  await Log("backend", "warn",   "controller", "Deprecated endpoint /v1/ping called");
  await Log("backend", "error",  "handler",    "Unhandled exception in POST /api/orders");
  await Log("backend", "fatal",  "service",    "Max retries reached – shutting down");
  await Log("backend", "info",   "auth",       "JWT issued for userId=99 ttl=1h");
  await Log("backend", "error",  "auth",       "JWT verification failed – expired");
  await Log("backend", "info",   "utils",      "Date formatted to ISO-8601");
  await Log("backend", "info",   "cron_job",   "Task cleanup_sessions triggered");
  await Log("backend", "warn",   "utils",      "Hydration skipped for avatar field");
  await Log("backend", "debug",  "domain",     "User entity constructed id=7");
  await Log("frontend", "info",  "page",       "Dashboard page mounted");
  await Log("frontend", "debug", "component",  "Navbar re-render: theme prop changed");
  await Log("frontend", "info",  "api",        "GET /api/notifications 200 5 items");
  await Log("frontend", "warn",  "state",      "Store updated with stale data");
  await Log("frontend", "error", "hook",       "useAuth: session token refresh failed");
  await Log("frontend", "debug", "style",      "Theme toggled to dark mode");
})();
