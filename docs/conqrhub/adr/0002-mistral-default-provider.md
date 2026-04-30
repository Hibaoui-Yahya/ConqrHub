# ADR 0002 — Default AI provider: Mistral

> **Status:** Accepted (v1)
> **Date:** 2026-04-30
> **Decision-maker:** ConqrHub engineering
> **Related:** [master-plan.md](../master-plan.md) §1, §5, §10 (Branch 1); ADR 0001

## Context

ConqrHub's existing AI provider abstraction (`AiProviderService`) supports four drivers via the Vercel AI SDK: `openai`, `gemini`, `ollama`, `openai-compatible`. Mistral works today through `openai-compatible`, but it is not a first-class driver, has no defaults, and isn't documented as a supported configuration.

For v1 of the RAG system we need to commit to a default provider. The choice affects:

- LLM for generation (answers, chat, query rewrite, verifier)
- Embedding model (dimension, multilingual quality, cost)
- Reranker availability
- Cost ceilings (cloud) and self-hosted parity (Ollama)
- Multilingual support — content includes French and Arabic alongside English

## Decision

**Mistral is the default AI provider for ConqrHub v1**, configured via:

- `AI_DRIVER=mistral`
- LLM: `mistral-large-latest` (generation, verifier, query rewrite)
- Embeddings: `mistral-embed`, dimension **1024**
- Reranker: Mistral's reranker API (when ranker becomes generally available; until then, the reranker stage is a Mistral-large rescoring pass — see Branch 4)

Implementation path:

- Branch 1 adds `'mistral'` as a first-class entry in the `AiDriver` union and uses `@ai-sdk/mistral`.
- Self-hosted customers can run Mistral via Ollama (`AI_DRIVER=ollama`, model `mistral-large` / `mistral-embed`-equivalent) for parity without a cloud account.
- The other four drivers (`openai`, `gemini`, `openai-compatible`, `ollama`) remain fully supported. No driver is removed.

## Consequences

### Positive

- **Strong multilingual baseline.** Mistral's models perform well across English, French, and Arabic without model-swap per language; the chunker and prompt templates can stay language-agnostic.
- **One vendor, one bill.** LLM + embeddings + (eventually) reranker from the same provider simplifies cost tracking and credentials management.
- **Self-hosted parity via Ollama.** No customer is forced into a cloud dependency they can't accept; the same model family runs on-prem.
- **Solid pricing position.** Mistral cloud is competitive vs OpenAI/Anthropic on Mistral-large and noticeably cheaper on `mistral-embed`. Embedding cost is the dominant scaling factor for ingestion at workspace size.
- **AGPL-friendly posture.** Mistral's open-weight models (where applicable) are easier to package alongside an AGPL distribution than closed-weight provider stacks.

### Negative

- **Single-provider risk.** A Mistral outage degrades all RAG features. Mitigation: the abstraction supports four other drivers; `AI_DRIVER` flip + restart switches the entire stack. Embeddings tagged with `model` mean a provider change requires a re-embed, not a re-architecture.
- **Reranker maturity.** Mistral's dedicated reranker API has a shorter track record than Cohere Rerank or BGE local. Mitigation: Branch 4 ships with a fallback that uses Mistral-large as a cross-encoder if the reranker API is unavailable; BGE-local via Ollama is a documented escape hatch.
- **`mistral-embed` is 1024-dim, not 1536.** Slightly less expressive than OpenAI `text-embedding-3-large` at default dimension. Mitigation: at workspace scale, retrieval quality is dominated by chunking, hybrid merge, and reranking — not the last 512 dimensions. Eval harness (Branch 8) measures this empirically.
- **No MRL truncation.** Unlike OpenAI `text-embedding-3-*`, mistral-embed doesn't natively support Matryoshka truncation. `AI_EMBEDDING_SUPPORTS_MRL=false` in defaults. Storage is fixed at 1024 floats per chunk.
- **Less cross-language tooling on day one.** The embedding model is multilingual, but downstream tools (e.g., specialized rerankers per language) are sparser than for the OpenAI ecosystem.

## Alternatives considered

| Option | Why not the v1 default |
|--------|------------------------|
| **OpenAI (gpt-4o + text-embedding-3-large)** | Strong baseline, but Mistral's multilingual edge and pricing tilt the choice. OpenAI remains a fully-supported driver for customers who prefer it. |
| **Anthropic (Claude)** | Excellent generation quality, but no first-party embedding model. Splitting providers (Claude for generation, OpenAI for embeddings) doubles the operational surface. Reconsider if Anthropic ships embeddings. |
| **Gemini** | Good multilingual, but already supported as a non-default driver; no current customer pull. |
| **Ollama-only (local)** | Operationally elegant but requires GPU at every customer site. Sets self-hosted as the floor, not the ceiling — we want hosted-mode customers to run on Mistral cloud, not local Ollama. |
| **Cohere (Command + Rerank + Embed)** | Strong reranker, decent embeddings, but generation lags. Considered for reranker-only role; deferred to Branch 4 fallback. |
| **OpenAI-compatible (LiteLLM, Azure OpenAI, vLLM)** | Already supported as a driver; not a "default" because the actual model behind it varies. Customers can route Mistral-via-Azure through this if needed. |

## Revisit conditions

Reopen this ADR if:

- Mistral pricing or cloud SLA materially worsens.
- A clearly superior multilingual embedding model emerges (consider switching defaults; existing embeddings tagged with `model` ease the migration).
- A paying customer category appears that cannot use Mistral (compliance, residency); a fallback default may need to be defined per region.
- Mistral discontinues `mistral-embed` or the model family.

Until then, Mistral stays as the documented default; other drivers remain fully supported configurations.
