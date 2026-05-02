import * as http from "http";
import { Log, configureLogger } from "../../logging_middleware/src/index";

const CLIENT_ID     = "ec763663-c2d2-47ba-a30e-7cd99a20ee30";
const CLIENT_SECRET = "thDRTWxKMMwMyrfV";
const EMAIL         = "ar1132@srmist.edu.in";
const NAME          = "arpit rajan";
const ROLL_NO       = "ra2311003010543";
const ACCESS_CODE   = "QkbpxH";

const BASE_URL = "http://20.207.122.201/evaluation-service";

interface Depot {
  ID: number;
  MechanicHours: number;
}

interface Vehicle {
  TaskID: string;
  Duration: number;
  Impact: number;
}

interface ScheduleResult {
  depotID: number;
  budget: number;
  totalImpact: number;
  totalDuration: number;
  selectedTasks: string[];
}

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
      res.on("data", (chunk: string) => { data += chunk; });
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

async function fetchDepots(headers: Record<string, string>): Promise<Depot[]> {
  await Log("backend", "info", "service", "Fetching depot list");
  const res = await fetch(`${BASE_URL}/depots`, { headers });
  if (!res.ok) {
    await Log("backend", "error", "service", `Depot API returned HTTP ${res.status}`);
    throw new Error(`Depot fetch failed: ${res.status}`);
  }
  const data = await res.json() as { depots: Depot[] };
  await Log("backend", "info", "service", `Retrieved ${data.depots.length} depots`);
  return data.depots;
}

async function fetchVehicles(headers: Record<string, string>): Promise<Vehicle[]> {
  await Log("backend", "info", "service", "Fetching vehicle task list");
  const res = await fetch(`${BASE_URL}/vehicles`, { headers });
  if (!res.ok) {
    await Log("backend", "error", "service", `Vehicles API returned HTTP ${res.status}`);
    throw new Error(`Vehicles fetch failed: ${res.status}`);
  }
  const data = await res.json() as { vehicles: Vehicle[] };
  await Log("backend", "info", "service", `Fetched ${data.vehicles.length} vehicles`);
  return data.vehicles;
}

function knapsack(vehicles: Vehicle[], capacity: number): { totalImpact: number; selected: Vehicle[] } {
  const n = vehicles.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const { Duration, Impact } = vehicles[i - 1];
    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i - 1][w];
      if (Duration <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - Duration] + Impact);
      }
    }
  }

  const selected: Vehicle[] = [];
  let w = capacity;
  for (let i = n; i > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selected.push(vehicles[i - 1]);
      w -= vehicles[i - 1].Duration;
    }
  }

  return { totalImpact: dp[n][capacity], selected };
}

async function schedule(depots: Depot[], vehicles: Vehicle[]): Promise<ScheduleResult[]> {
  const results: ScheduleResult[] = [];

  for (const depot of depots) {
    await Log("backend", "debug", "service", `Knapsack depot ${depot.ID} budget ${depot.MechanicHours}h`);

    const { totalImpact, selected } = knapsack(vehicles, depot.MechanicHours);
    const totalDuration = selected.reduce((sum, v) => sum + v.Duration, 0);

    const result: ScheduleResult = {
      depotID: depot.ID,
      budget: depot.MechanicHours,
      totalImpact,
      totalDuration,
      selectedTasks: selected.map(v => v.TaskID),
    };

    results.push(result);
    await Log("backend", "info", "service", `Depot ${depot.ID}: impact=${totalImpact}`);
  }

  return results;
}

function printResults(results: ScheduleResult[]): void {
  console.log("\n════════════════════════════════════════════════════════");
  console.log("        VEHICLE MAINTENANCE SCHEDULER – RESULTS         ");
  console.log("════════════════════════════════════════════════════════\n");

  for (const r of results) {
    console.log(`Depot ${r.depotID}`);
    console.log(`  Budget          : ${r.budget} mechanic-hours`);
    console.log(`  Hours Used      : ${r.totalDuration} mechanic-hours`);
    console.log(`  Total Impact    : ${r.totalImpact}`);
    console.log(`  Tasks Selected  : ${r.selectedTasks.length}`);
    console.log(`  Task IDs:`);
    r.selectedTasks.forEach(id => console.log(`    - ${id}`));
    console.log();
  }
}

(async () => {
  try {
    const token = await getToken();

    configureLogger({
      serverUrl: "http://20.207.122.201",
      authToken: token,
      minLevel: "debug",
      consoleOutput: true,
    });

    const HEADERS = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    await Log("backend", "info", "service", "Scheduler starting");

    const [depots, vehicles] = await Promise.all([fetchDepots(HEADERS), fetchVehicles(HEADERS)]);

    await Log("backend", "debug", "service", `Loaded ${depots.length} depots, ${vehicles.length} vehicles`);

    const results = await schedule(depots, vehicles);

    printResults(results);

    await Log("backend", "info", "service", "Scheduler completed");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await Log("backend", "fatal", "service", `Scheduler error: ${msg}`.slice(0, 48));
    process.exit(1);
  }
})();
