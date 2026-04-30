# ADR 0001 — Vector store: pgvector

> **Status:** Accepted (v1)
> **Date:** 2026-04-30
> **Decision-maker:** ConqrHub engineering
> **Related:** [master-plan.md](../master-plan.md) §4, §7, §11; ADR 0003

## Context

ConqrHub needs a vector index to power semantic retrieval for RAG. Candidates considered: pgvector, Qdrant, Weaviate, Milvus, Pinecone, Typesense (vector mode).

Constraints driving the decision:

1. **Permission safety is paramount.** Retrieval must filter chunks by workspace, space, page-level access, and soft-delete status — every time. Permission data is in Postgres; CASL rules and `page_access` / `page_permissions` tables already enforce the same model in the wiki UI.
2. **Self-hosted parity.** Customers run ConqrHub in their own infrastructure. Adding a second stateful service (Pinecone, Qdrant, Weaviate) is a meaningful operational tax — backups, monitoring, network policy, version skew.
3. **Multi-tenant by default.** Every retrieval is workspace-scoped. Tenant isolation is a first-class correctness concern, not an optimization.
4. **Existing search is already in Postgres** (`tsv` + `pg-tsquery`). Hybrid retrieval needs to merge vector and lexical scores; co-location simplifies that.
5. **Scale target for v1.** A typical workspace today is far below the thresholds where pgvector starts hurting (HNSW handles 10M+ vectors with sub-100ms P95 on commodity hardware).

## Decision

**Use pgvector as the v1 vector store.** All embeddings live in `ai_page_embeddings` (later `ai_embeddings` once Branch 7 generalizes the schema) in the same Postgres instance as the rest of the application data.

- Indexing strategy: **HNSW** with cosine distance. IVFFlat considered and rejected — HNSW gives better recall/latency on the workspace-size distribution we expect, and pgvector ≥ 0.5 ships HNSW by default.
- Embedding dimension: **1024** (mistral-embed default; see ADR 0002).
- Permission filter is a SQL `WHERE` clause on the same query as the vector search, not a post-filter. See ADR 0003.

## Consequences

### Positive

- **One database to back up, monitor, secure.** No second stateful service for self-hosted customers.
- **Permission filter is a SQL `JOIN`** — same code path as `PageAccessService.validateCanView`. Behavior is consistent across UI search and RAG retrieval.
- **Cross-tenant isolation is structural.** A query that forgets `WHERE workspace_id = $1` is a SQL bug we can grep for, not a misconfigured Pinecone namespace.
- **Transactional consistency.** A page write and its embedding update can share a transaction (Branch 2 will use this — content-hash check + embedding insert in one tx).
- **Cheaper.** No external service bill. Embedding compute is the dominant cost, and it's the same regardless of where the index lives.

### Negative

- **Postgres extension dependency.** Customers running unsupported Postgres distributions (some managed services, very old self-hosted) may not have `pgvector`. Mitigation: dev image is `pgvector/pgvector:pg16`; `.env.example` and migration docs flag the requirement; an explicit `CREATE EXTENSION IF NOT EXISTS vector` runs in Branch 2's migration.
- **Index rebuild cost on dimension change.** Switching from a 1024-dim model to a 1536-dim model means a full re-embed and a new HNSW index. Mitigation: `model` and `dim` columns are stored on every row; swap = re-embed, not re-architect.
- **Less optimal for billion-vector workloads.** v3 customers with very large external integrations may eventually outgrow pgvector. Mitigation: revisit at that scale; the Vercel AI SDK abstraction means swapping the store is a repo-level change, not a re-architecture.
- **Query planner sensitivity.** Mixing HNSW search with permission `JOIN`s requires `SET LOCAL enable_seqscan = off` patterns or careful index hinting in some cases. We accept this tax in Branch 3.

## Alternatives considered

| Option | Why rejected |
|--------|--------------|
| **Pinecone** | Adds an external billing line, network-bound, no co-location with permissions. Tenant isolation via namespaces is a configuration concern, not a structural one. |
| **Qdrant (self-hosted)** | Better at billion-scale; not needed at v1 scale. Adds a second stateful service for every customer. |
| **Weaviate** | Strong feature set, but again a second service. Native ACL features don't map cleanly onto our CASL model. |
| **Milvus** | Same operational tax. Stronger pure-vector perf, but we never benefit until v3. |
| **Typesense vector mode** | Typesense is already optionally enabled in this repo. Reusing it for vectors is tempting, but it's not a primary deployment target (default search is Postgres FTS), and mixing two vector stores split by deployment mode is worse than one consistent choice. |
| **In-process FAISS** | Loses durability. Restart = re-embed. Unacceptable at any meaningful scale. |

## Revisit conditions

This ADR should be reopened if any of:

- A workspace exceeds **10M chunks** with sub-second retrieval P95 unmet after HNSW tuning.
- A customer category emerges that cannot install Postgres extensions (locked-down managed services).
- Permission semantics evolve to need vector-side ACL features pgvector cannot express.

Until any of those, pgvector stays.
