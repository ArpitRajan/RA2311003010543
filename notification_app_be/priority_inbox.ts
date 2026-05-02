import { Log, configureLogger } from "../logging_middleware/src/index";

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJhcjExMzJAc3JtaXN0LmVkdS5pbiIsImV4cCI6MTc3NzcwMzI1OSwiaWF0IjoxNzc3NzAyMzU5LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiZGViMDI3NTEtNWY4ZS00OTlmLWFjZjAtM2YwZGQxNTZlY2IxIiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoiYXJwaXQgcmFqYW4iLCJzdWIiOiJlYzc2MzY2My1jMmQyLTQ3YmEtYTMwZS03Y2Q5OWEyMGVlMzAifSwiZW1haWwiOiJhcjExMzJAc3JtaXN0LmVkdS5pbiIsIm5hbWUiOiJhcnBpdCByYWphbiIsInJvbGxObyI6InJhMjMxMTAwMzAxMDU0MyIsImFjY2Vzc0NvZGUiOiJRa2JweEgiLCJjbGllbnRJRCI6ImVjNzYzNjYzLWMyZDItNDdiYS1hMzBlLTdjZDk5YTIwZWUzMCIsImNsaWVudFNlY3JldCI6InRoRFJUV3hLTU13TXlyZlYifQ.oVLMMGm9RWy4C6glzTrI1I8vhcHW52oP8jncAfgoZyk";

const BASE_URL = "http://20.207.122.201/evaluation-service";

const HEADERS = {
  "Authorization": `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

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

configureLogger({
  serverUrl: "http://20.207.122.201",
  authToken: TOKEN,
  minLevel: "debug",
  consoleOutput: true,
});

const TYPE_WEIGHT: Record<NotificationType, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

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

async function fetchNotifications(): Promise<RawNotification[]> {
  await Log("frontend", "info", "api", "Fetching notifications from evaluation-service");
  const res = await fetch(`${BASE_URL}/notifications`, { headers: HEADERS });
  if (!res.ok) {
    await Log("frontend", "error", "api", `Notifications API returned HTTP ${res.status}`);
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
    await Log("frontend", "info", "page", "Priority Inbox initialising");

    const notifications = await fetchNotifications();

    await Log("frontend", "debug", "state", `Scoring ${notifications.length} notifications by type-weight and recency`);

    const top10 = buildPriorityInbox(notifications, 10);

    printInbox(top10);

    await Log("frontend", "info", "page", `Priority Inbox ready – displaying top ${top10.length} notifications`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await Log("frontend", "fatal", "page", `Priority Inbox failed: ${msg}`);
    process.exit(1);
  }
})();
