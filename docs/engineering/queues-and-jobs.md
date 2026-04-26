# Queues & Jobs

How to write, debug, and operate background jobs. The list of queues and jobs is in [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md).

## Stack

- **BullMQ** with Redis as the broker
- Workers run **in the API server process** by default
- Queue and job constants live in `apps/server/src/integrations/queue/constants/queue.constants.ts`

## The 10 queues

```
EMAIL_QUEUE          ATTACHMENT_QUEUE     GENERAL_QUEUE        BILLING_QUEUE
FILE_TASK_QUEUE      SEARCH_QUEUE         AI_QUEUE             HISTORY_QUEUE
NOTIFICATION_QUEUE   AUDIT_QUEUE
```

## Producer pattern

```ts
// apps/server/src/core/page/services/page.service.ts (sketch)
constructor(@InjectQueue(QueueName.SEARCH_QUEUE) private searchQueue: Queue) {}

async onPageContentUpdated(pageId: string) {
  await this.searchQueue.add(JobName.SEARCH_INDEX_PAGE, { pageId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  });
}
```

## Processor pattern

```ts
// apps/server/src/integrations/queue/processors/search-index.processor.ts (sketch)
@Processor(QueueName.SEARCH_QUEUE)
export class SearchIndexProcessor {
  @Process(JobName.SEARCH_INDEX_PAGE)
  async handleIndex(job: Job<{ pageId: string }>) {
    await this.searchService.index(job.data.pageId);
  }
}
```

## Adding a new job

1. **Add the constant** in `queue.constants.ts`:
   ```ts
   export const JobName = {
     ...,
     YOUR_JOB: 'your_job',
   };
   ```
2. **Pick a queue.** Use an existing one if the work is similar in priority and rate; create a new queue only when isolation matters.
3. **Write the processor** — keep it thin and idempotent.
4. **Enqueue from the producer** — service that owns the side effect.
5. **Update [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md).**
6. **Test it** — unit-test the processor and integration-test that the producer enqueues.

## Idempotency

Most jobs run at-least-once. Make processors idempotent:

- Use deterministic IDs / timestamps.
- For "index this page" jobs: overwrite is fine.
- For email: deduplicate at the data layer (e.g. don't send the same digest twice in 24h).
- For audit log: append; never re-emit the same event ID.

## Retries

Defaults: 3 attempts, exponential backoff. Customize per-job:

```ts
await queue.add(JobName.X, payload, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,    // keep last 100 completed jobs
  removeOnFail: false,      // keep failed jobs for inspection
});
```

## Scheduled / repeating jobs

Examples: `AUDIT_CLEANUP`, `VERIFICATION_RECONCILE`, `PAGE_UPDATE_DIGEST`.

```ts
await queue.add(JobName.AUDIT_CLEANUP, {}, {
  repeat: { pattern: '0 3 * * *' },  // every day at 3am
  jobId: 'audit-cleanup',            // dedupe by id
});
```

## Observability

- Failed jobs are kept in Redis (per `removeOnFail` config). Inspect via Bull-Board or `bullmq` CLI.
- For production, wire up Bull-Board behind admin-only auth; very useful for triage.
- Log job lifecycle from the processor — `onCompleted`, `onFailed`, `onStalled`.

## Performance

- **In-process workers** are the simplest deployment but compete with API request handling for CPU. For heavy workloads (PDF export, attachment indexing), run a dedicated worker process.
- **Concurrency** is set per processor:
  ```ts
  @Processor(QueueName.SEARCH_QUEUE, { concurrency: 4 })
  ```
- **Rate limiting** — BullMQ supports `limiter` per queue for external-API-bound work (AI providers, Stripe, etc.).

## Common gotchas

| Symptom | Cause |
|---|---|
| Jobs not running | Worker process not started, or wrong Redis URL |
| Jobs stuck "waiting" | No processor registered for that job name |
| Duplicate emails | Producer enqueued twice and processor isn't idempotent |
| Memory bloat | `removeOnComplete: false` (default for large historical retention) — set a number |
| Stalled jobs | Processor took longer than the lock timeout — increase `lockDuration` or split work |

## Related

- The full job list: [`../reference/queues-and-jobs.md`](../reference/queues-and-jobs.md)
- Audit events emitted by jobs: [`../reference/audit-events.md`](../reference/audit-events.md)
- Notification events: [`../reference/notification-events.md`](../reference/notification-events.md)
