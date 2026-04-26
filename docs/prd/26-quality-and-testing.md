# PRD 26 — Quality & Testing

> **Source:** PA 26, lines 10253–11089.

## Area overview

The test pyramid, what's covered, and the specialized test suites that protect the product's most critical surfaces.

## Epic 26.1 — Test Pyramid

```
              E2E (supertest)        — happy paths, auth at the boundary
              Integration            — module + DB; permission and queue paths
              Unit (Jest)            — services, utilities, repos with mocked DB
```

See [`../engineering/testing.md`](../engineering/testing.md) for daily workflow.

## Epic 26.2 — Specialized Test Suites

### 26.2.1 — Permission tests *(security-critical)*

The permission system is the load-bearing security feature. Tests must cover:
- Workspace-role boundaries
- Space-role + group-role resolution
- Page restriction with inheritance
- Permission-aware search, AI retrieval, exports, notifications
- Property-based tests with random ACL configurations

### 26.2.2 — Real-time tests

- Hocuspocus auth at connect
- Permission changes mid-session
- Multi-instance Yjs fan-out
- Reconnect + offline buffer

### 26.2.3 — Search tests

- Permission filter applied before result return
- tsvector indexing + reindex on changes
- Typesense driver parity
- Attachment-indexing pipeline

### 26.2.4 — AI tests

- Tool-call permission boundaries (no escalation through tools)
- Retrieval permission filter (LLM never sees forbidden chunks)
- Streaming SSE behavior + abort
- Provider-specific quirks (OpenAI vs Gemini vs Ollama)

### 26.2.5 — Queue tests

- Producer enqueues correctly
- Processor is idempotent
- Retry + backoff
- Stalled-job recovery

### 26.2.6 — Migration tests

- `up` and `down` for every migration
- Idempotent re-run of `latest`
- Data backfill correctness for migrations that mutate rows

### 26.2.7 — License + entitlement tests

- Free tier with no EE module
- Paid tier with valid license
- Expired license falls back to free
- Cloud plan changes propagate

### 26.2.8 — Public-share tests

- Public links require token
- Password and expiration enforced
- Workspace disable revokes immediately
- Permission + brand-removal honored

## Epic 26.3 — Coverage and Gates

- Coverage measured but not a hard gate (avoids gaming)
- Permission, audit, and license code paths held to higher coverage standard
- CI runs lint, type check, unit, e2e, build

## Epic 26.4 — Manual QA

- Editor flows (browser-only)
- Mobile responsive (planned full support)
- Keyboard accessibility checklist
- Screen reader sweep before each major release

## Cross-references

- Engineering: [`../engineering/testing.md`](../engineering/testing.md)
- Permission internals: [`../architecture/permissions-model.md`](../architecture/permissions-model.md)
- AI subsystem: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md)
