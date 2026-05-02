# Stage 1

## Campus Notification Platform – REST API Design

### Overview

The notification platform delivers real-time updates to students for three event categories: Placements, Events, and Results. The API follows REST conventions with JSON payloads over HTTPS. Authentication uses JWT Bearer tokens.

---

### Base URL

```
https://api.campus.internal/v1
```

---

### Common Headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer <jwt_token>` |
| `Content-Type` | `application/json` |
| `Accept` | `application/json` |

---

### Endpoints

#### 1. List Notifications

```
GET /notifications
```

Returns all notifications for the authenticated student, newest first.

**Query Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | string | No | Filter by `Placement`, `Result`, or `Event` |
| `isRead` | boolean | No | Filter by read status |
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Items per page (default: 20, max: 100) |

**Response 200**

```json
{
  "data": [
    {
      "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "type": "Placement",
      "message": "CSX Corporation hiring",
      "isRead": false,
      "createdAt": "2026-04-22T17:51:18Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 142
  }
}
```

**Response 401**

```json
{ "error": "Unauthorized", "message": "Invalid or expired token" }
```

---

#### 2. Get Single Notification

```
GET /notifications/:id
```

**Response 200**

```json
{
  "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
  "type": "Placement",
  "message": "CSX Corporation hiring",
  "isRead": true,
  "createdAt": "2026-04-22T17:51:18Z",
  "readAt": "2026-04-22T18:10:00Z"
}
```

**Response 404**

```json
{ "error": "NotFound", "message": "Notification not found" }
```

---

#### 3. Mark Notification as Read

```
PATCH /notifications/:id/read
```

**Response 200**

```json
{
  "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
  "isRead": true,
  "readAt": "2026-04-22T18:10:00Z"
}
```

---

#### 4. Mark All Notifications as Read

```
PATCH /notifications/read-all
```

**Response 200**

```json
{ "updated": 38 }
```

---

#### 5. Delete a Notification

```
DELETE /notifications/:id
```

**Response 204** — No body.

---

#### 6. Get Unread Count

```
GET /notifications/unread-count
```

**Response 200**

```json
{ "unreadCount": 12 }
```

---

#### 7. Create Notification (Admin/System)

```
POST /notifications
```

**Request Body**

```json
{
  "studentIds": ["student-uuid-1", "student-uuid-2"],
  "type": "Placement",
  "message": "Google hiring for SWE roles"
}
```

**Response 202**

```json
{ "jobId": "job-uuid", "status": "queued", "recipientCount": 2 }
```

---

### Real-Time Notification Mechanism

#### WebSocket Channel

```
wss://api.campus.internal/v1/ws/notifications
```

The client connects after authentication. On connect, the server sends any missed notifications since the last disconnect. New notifications are pushed as JSON frames:

```json
{
  "event": "new_notification",
  "data": {
    "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
    "type": "Placement",
    "message": "CSX Corporation hiring",
    "isRead": false,
    "createdAt": "2026-04-22T17:51:18Z"
  }
}
```

The client sends a heartbeat ping every 30 seconds. If the server does not receive a ping within 60 seconds it closes the connection. The client reconnects with exponential backoff.

#### Server-Sent Events (SSE) Fallback

```
GET /notifications/stream
```

Clients that cannot use WebSockets subscribe to this endpoint. The server pushes `data:` events in the same JSON structure. SSE is unidirectional so marking-as-read must still use the REST endpoints.

---

---

# Stage 2

## Persistent Storage Design

### Database Choice: PostgreSQL

PostgreSQL is chosen for the following reasons:

- Notifications have a well-defined, consistent schema — relational storage is a natural fit.
- ACID transactions guarantee that a notification is never partially written.
- Native support for `UUID`, `ENUM`, `TIMESTAMPTZ`, and partial indexes makes the schema clean and efficient.
- The `pg_notify` / `LISTEN` / `NOTIFY` mechanism can feed the real-time WebSocket layer directly.
- Mature ecosystem with battle-tested connection pooling (PgBouncer) and replication tools.

---

### Schema

```sql
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

CREATE TABLE students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  notification_type   notification_type NOT NULL,
  message             TEXT NOT NULL,
  is_read             BOOLEAN NOT NULL DEFAULT FALSE,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_student_unread
  ON notifications (student_id, is_read, created_at DESC)
  WHERE is_read = FALSE;

CREATE INDEX idx_notifications_student_created
  ON notifications (student_id, created_at DESC);

CREATE INDEX idx_notifications_type
  ON notifications (notification_type, created_at DESC);
```

---

### Scaling Problems and Solutions

| Problem | Solution |
|---|---|
| Table grows to hundreds of millions of rows; sequential scans become slow | Range-partition `notifications` by `created_at` (monthly partitions). Older partitions are queried less frequently and can be archived or moved to cold storage. |
| Write throughput spikes during mass-notify events | Use a message queue (Redis Streams or Kafka) to decouple the write path. The API enqueues the job; worker processes write to the DB asynchronously. |
| Hot rows for popular students | Connection pooling via PgBouncer; read replicas for `SELECT` queries. |
| Delivering unread counts per student on every page load | Cache per-student unread counts in Redis with a TTL. Invalidate on write or mark-as-read. |

---

### Queries Mapped to Stage 1 Endpoints

**GET /notifications (paginated, newest first)**

```sql
SELECT id, notification_type, message, is_read, read_at, created_at
FROM notifications
WHERE student_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

**GET /notifications?type=Placement**

```sql
SELECT id, notification_type, message, is_read, read_at, created_at
FROM notifications
WHERE student_id = $1
  AND notification_type = 'Placement'
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

**GET /notifications/unread-count**

```sql
SELECT COUNT(*) AS unread_count
FROM notifications
WHERE student_id = $1
  AND is_read = FALSE;
```

**PATCH /notifications/:id/read**

```sql
UPDATE notifications
SET is_read = TRUE, read_at = NOW()
WHERE id = $1 AND student_id = $2;
```

**PATCH /notifications/read-all**

```sql
UPDATE notifications
SET is_read = TRUE, read_at = NOW()
WHERE student_id = $1
  AND is_read = FALSE;
```

**DELETE /notifications/:id**

```sql
DELETE FROM notifications
WHERE id = $1 AND student_id = $2;
```

---

---

# Stage 3

## Query Analysis and Optimisation

### Original Query

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

### Is it Accurate?

The query is logically correct for its intent. However, `SELECT *` retrieves all columns including `message` body text, which adds unnecessary I/O when the caller only needs IDs, types, and timestamps for a list view.

### Why is it Slow?

With 50,000 students and 5,000,000 notifications there is no composite index on `(student_id, is_read, created_at)`. PostgreSQL performs:

1. A full sequential scan of the `notifications` table to find rows matching `studentID = 1042`.
2. A filter pass for `isRead = false`.
3. An in-memory sort on `createdAt DESC`.

For 5,000,000 rows the sequential scan alone reads the entire table regardless of how many rows match. Cost is O(N) where N is the total row count.

### Fix

```sql
CREATE INDEX idx_notifications_student_unread
  ON notifications (student_id, is_read, created_at DESC)
  WHERE is_read = FALSE;

SELECT id, notification_type, message, created_at
FROM notifications
WHERE student_id = 1042
  AND is_read = FALSE
ORDER BY created_at DESC;
```

The partial index (`WHERE is_read = FALSE`) contains only unread rows, dramatically reducing index size as notifications get read over time. The composite key `(student_id, is_read, created_at DESC)` lets PostgreSQL satisfy the `WHERE` and `ORDER BY` in a single index scan with no sort step. Cost drops to O(k log N) where k is the number of unread notifications for that student.

### On Indexing Every Column

Indexing every column is counterproductive. Each index:

- Consumes additional disk space proportional to the column cardinality.
- Adds overhead to every `INSERT`, `UPDATE`, and `DELETE` because all indexes must be kept consistent.
- Rarely gets used by the query planner when the column has low selectivity (e.g. a boolean `is_read`).

Indexes should be added surgically based on actual query patterns, not defensively on all columns.

### Placement Notifications in the Last 7 Days

```sql
SELECT s.id AS student_id, s.name, s.email, n.message, n.created_at
FROM notifications n
JOIN students s ON s.id = n.student_id
WHERE n.notification_type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days'
ORDER BY n.created_at DESC;
```

---

---

# Stage 4

## Notification Fetching Performance

### Problem

Fetching notifications from the database on every page load for 50,000 concurrent students overwhelms the DB with identical or near-identical queries.

### Strategies

#### 1. Cache Unread Count in Redis

Store a per-student unread count key: `notifications:unread:{student_id}`. Increment on new notification, decrement on mark-as-read. The count endpoint never hits the DB.

**Tradeoff:** Count can drift if a worker crashes between the DB write and the Redis increment. Reconcile periodically with a background job.

#### 2. Cache the Notification List

Cache the most recent page of notifications per student: `notifications:list:{student_id}:page:1`. TTL of 60 seconds. On cache hit, return immediately. On cache miss or mutation (read/delete), invalidate the key.

**Tradeoff:** Stale reads within the TTL window. A student marking a notification as read may see the old list for up to 60 seconds unless the cache is explicitly invalidated on write.

#### 3. Pagination with Cursor-Based Navigation

Replace page/offset with a cursor (`created_at`, `id` tuple). Offset-based pagination requires scanning and discarding rows; cursor-based queries go directly to the right position using the index.

**Tradeoff:** Random access to arbitrary pages is not possible. Suitable for infinite-scroll UIs.

#### 4. Read Replicas for SELECT Traffic

Route all `SELECT` queries to a read replica. The primary handles only writes.

**Tradeoff:** Replication lag means a student who just received a notification might not see it immediately on the replica. Acceptable for notifications (eventual consistency is fine); not acceptable for financial or transactional data.

#### 5. WebSocket Push Instead of Poll

Push new notifications to connected clients in real time so page load queries only need to fetch the initial state once per session, not once per page load.

**Tradeoff:** Adds infrastructure complexity (connection management, pub/sub broker). Clients on flaky networks may miss events and need a reconcile-on-reconnect mechanism.

---

---

# Stage 5

## Reliable Mass Notification

### Observed Shortcomings

The original implementation is synchronous and single-threaded. For 50,000 students:

- It processes students one by one — total latency is `50000 × (email_latency + db_latency + push_latency)`.
- If `send_email` fails at student 25,000 there is no retry — the remaining 25,000 never get notified.
- There is no idempotency — re-running the function after a partial failure causes duplicates for the students who already received the notification.
- `send_email` and `push_to_app` are external I/O calls with variable latency; running them inline blocks the function unnecessarily.

### The 200-Student Email Failure

Since there is no job tracking or retry queue, those 200 students are silently dropped. Without a record of which students failed, a re-run would duplicate notifications for the 24,800 who succeeded.

### Should DB Save and Email Happen Together?

No. They should not be coupled. The DB write confirms that the notification exists and is durable. The email is a delivery mechanism that can fail, be rate-limited, or be delayed. Coupling them means a transient email failure prevents the notification from being recorded in the DB at all, which is worse than an email failure alone.

### Redesigned Pseudocode

```
function notify_all(student_ids: array, message: string, job_id: string):
  for student_id in student_ids:
    if not already_enqueued(job_id, student_id):
      enqueue(job_id, student_id, message, status="pending")

  trigger_workers(job_id)


worker process:
  job = dequeue_pending_task()
  if job is null: return

  mark(job, status="in_progress")

  try:
    save_to_db(job.student_id, job.message)
    send_email(job.student_id, job.message)
    push_to_app(job.student_id, job.message)
    mark(job, status="done")
  catch email_error:
    mark(job, status="email_failed")
    schedule_retry(job, delay=exponential_backoff(job.attempts))
  catch fatal_error:
    mark(job, status="failed")
    alert_ops(job, fatal_error)
```

Key changes:

- The job queue records every `(job_id, student_id)` pair before dispatch, providing a complete manifest.
- Workers process tasks concurrently and independently — one failure does not block others.
- `save_to_db` happens first; if it succeeds the notification is durable regardless of what happens to email or push.
- Failed email deliveries are retried with exponential backoff without re-sending to students who already received it.
- Idempotency is enforced by the `already_enqueued` check so re-triggering a job is safe.

---

---

# Stage 6

## Priority Inbox

### Approach

Each notification receives a composite priority score:

```
score = type_weight + recency_score
```

Where:

- `type_weight`: Placement = 3, Result = 2, Event = 1
- `recency_score`: `1 / (1 + age_in_hours)` — decays from 1 towards 0 as the notification ages

A **min-heap of fixed size N** maintains the top N notifications as the stream arrives:

- If the heap has fewer than N items, push unconditionally.
- Otherwise, if the incoming notification's score exceeds the heap minimum (root), replace the root and sift down.
- Each insertion is O(log N) regardless of the total number of notifications.

This is efficient for both batch processing (score all, heap insert) and a live stream (insert each new notification as it arrives in O(log N)).

### Implementation

See [`priority_inbox.ts`](./priority_inbox.ts) in `notification_app_be/`.

Run with:

```
npx ts-node notification_app_be/priority_inbox.ts
```

### Maintaining Top 10 as Notifications Keep Coming

Because the heap size is bounded to N, each new incoming notification triggers at most one heap operation (O(log N)). The heap always contains the current top N — there is no need to re-sort or re-scan the full history. This makes the approach suitable for a live WebSocket feed where new notifications arrive continuously.
