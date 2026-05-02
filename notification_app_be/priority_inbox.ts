import * as http from "http";
import { Log, configureLogger } from "../logging_middleware/src/index";

const CLIENT_ID     = "ec763663-c2d2-47ba-a30e-7cd99a20ee30";
const CLIENT_SECRET = "thDRTWxKMMwMyrfV";
const EMAIL         = "ar1132@srmist.edu.in";
const NAME          = "arpit rajan";
const ROLL_NO       = "ra2311003010543";
const ACCESS_CODE   = "QkbpxH";

const BASE_URL = "http://20.207.122.201/evaluation-service";

type NotificationType = "Placement" | "Result" | "Event";

interface RawNotification {
  ID: string;
  Type: NotificationType;
  Message: string;
  Timestamp: string;
}

interface ScoredNotification extends RawNotification {
  priorityScore: number;
}

const TYPE_WEIGHT: Record<NotificationType, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

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

function computeScore(n: RawNotification): number {
  const weight = TYPE_WEIGHT[n.Type];
  const ageMs = Date.now() - new Date(n.Timestamp).getTime();
  const recencyScore = 1 / (1 + ageMs / (1000 * 60 * 60));
  return weight + recencyScore;
}

class MinHeap {
  private heap: ScoredNotification[] = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  private parent(i: number) { return Math.floor((i - 1) / 2); }
  private left(i: number)   { return 2 * i + 1; }
  private right(i: number)  { return 2 * i + 2; }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }

  private bubbleUp(i: number): void {
    while (i > 0 && this.heap[this.parent(i)].priorityScore > this.heap[i].priorityScore) {
      this.swap(i, this.parent(i));
      i = this.parent(i);
    }
  }

  private sinkDown(i: number): void {
    let smallest = i;
    const l = this.left(i);
    const r = this.right(i);
    if (l < this.heap.length && this.heap[l].priorityScore < this.heap[smallest].priorityScore) smallest = l;
    if (r < this.heap.length && this.heap[r].priorityScore < this.heap[smallest].priorityScore) smallest = r;
    if (smallest !== i) { this.swap(i, smallest); this.sinkDown(smallest); }
  }

  push(notification: ScoredNotification): void {
    if (this.heap.length < this.capacity) {
      this.heap.push(notification);
      this.bubbleUp(this.heap.length - 1);
    } else if (notification.priorityScore > this.heap[0].priorityScore) {
      this.heap[0] = notification;
      this.sinkDown(0);
    }
  }

  getTopN(): ScoredNotification[] {
    return [...this.heap].sort((a, b) => b.priorityScore - a.priorityScore);
  }

  size(): number { return this.heap.length; }
}

async function fetchNotifications(headers: Record<string, string>): Promise<RawNotification[]> {
  await Log("frontend", "info", "api", "Fetching notifications");
  const res = await fetch(`${BASE_URL}/notifications`, { headers });
  if (!res.ok) {
    await Log("frontend", "error", "api", `Notifications API error ${res.status}`);
    throw new Error(`Notifications fetch failed: ${res.status}`);
  }
  const data = await res.json() as { notifications: RawNotification[] };
  await Log("frontend", "info", "api", `Fetched ${data.notifications.length} notifications`);
  return data.notifications;
}

function buildPriorityInbox(notifications: RawNotification[], topN: number): ScoredNotification[] {
  const heap = new MinHeap(topN);
  for (const n of notifications) {
    const scored: ScoredNotification = { ...n, priorityScore: computeScore(n) };
    heap.push(scored);
  }
  return heap.getTopN();
}

function printInbox(top: ScoredNotification[]): void {
  console.log("\n════════════════════════════════════════════════════════");
  console.log("              PRIORITY INBOX – TOP 10                  ");
  console.log("════════════════════════════════════════════════════════\n");
  top.forEach((n, i) => {
    console.log(`#${i + 1}  [${n.Type.toUpperCase().padEnd(9)}]  score=${n.priorityScore.toFixed(4)}`);
    console.log(`     ID      : ${n.ID}`);
    console.log(`     Message : ${n.Message}`);
    console.log(`     Time    : ${n.Timestamp}\n`);
  });
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

    await Log("frontend", "info", "page", "Priority Inbox initialising");

    const notifications = await fetchNotifications(HEADERS);

    await Log("frontend", "debug", "state", `Scoring ${notifications.length} notifications`);

    const top10 = buildPriorityInbox(notifications, 10);

    printInbox(top10);

    await Log("frontend", "info", "page", `Inbox ready, top ${top10.length} shown`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await Log("frontend", "fatal", "page", `Inbox failed: ${msg}`.slice(0, 48));
    process.exit(1);
  }
})();
