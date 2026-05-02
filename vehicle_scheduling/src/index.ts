import { Log, configureLogger } from "../../logging_middleware/src/index";

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJhcjExMzJAc3JtaXN0LmVkdS5pbiIsImV4cCI6MTc3NzcwMzI1OSwiaWF0IjoxNzc3NzAyMzU5LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiZGViMDI3NTEtNWY4ZS00OTlmLWFjZjAtM2YwZGQxNTZlY2IxIiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoiYXJwaXQgcmFqYW4iLCJzdWIiOiJlYzc2MzY2My1jMmQyLTQ3YmEtYTMwZS03Y2Q5OWEyMGVlMzAifSwiZW1haWwiOiJhcjExMzJAc3JtaXN0LmVkdS5pbiIsIm5hbWUiOiJhcnBpdCByYWphbiIsInJvbGxObyI6InJhMjMxMTAwMzAxMDU0MyIsImFjY2Vzc0NvZGUiOiJRa2JweEgiLCJjbGllbnRJRCI6ImVjNzYzNjYzLWMyZDItNDdiYS1hMzBlLTdjZDk5YTIwZWUzMCIsImNsaWVudFNlY3JldCI6InRoRFJUV3hLTU13TXlyZlYifQ.oVLMMGm9RWy4C6glzTrI1I8vhcHW52oP8jncAfgoZyk";

const BASE_URL = "http://20.207.122.201/evaluation-service";

const HEADERS = {
  "Authorization": `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

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

configureLogger({
  serverUrl: "http://20.207.122.201",
  authToken: TOKEN,
  minLevel: "debug",
  consoleOutput: true,
});

async function fetchDepots(): Promise<Depot[]> {
  await Log("backend", "info", "service", "Fetching depot list");
  const res = await fetch(`${BASE_URL}/depots`, { headers: HEADERS });
  if (!res.ok) {
    await Log("backend", "error", "service", `Depot API returned HTTP ${res.status}`);
    throw new Error(`Depot fetch failed: ${res.status}`);
  }
  const data = await res.json() as { depots: Depot[] };
  await Log("backend", "info", "service", `Retrieved ${data.depots.length} depots`);
  return data.depots;
}

async function fetchVehicles(): Promise<Vehicle[]> {
  await Log("backend", "info", "service", "Fetching vehicle task list");
  const res = await fetch(`${BASE_URL}/vehicles`, { headers: HEADERS });
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
    await Log("backend", "info", "service", "Scheduler starting");

    const [depots, vehicles] = await Promise.all([fetchDepots(), fetchVehicles()]);

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
