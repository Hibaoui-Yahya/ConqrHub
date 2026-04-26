# PRD 18 — Diagrams & Visual Documentation

> **Source:** PA 18, lines 5347–5409.

## Area overview

First-class support for embedding and editing diagrams inside pages.

## Epic 18.1 — Diagram Blocks

### Feature 18.1.1 — Mermaid

Inline Mermaid through the `custom-code-block` extension with `mermaid` language tag. Supports flowcharts, sequence, class, state, ER, gantt, journey, gitgraph.

**Acceptance.** Invalid Mermaid syntax shows helpful errors without breaking the page render.

### Feature 18.1.2 — Draw.io

Embedded Draw.io editor (`drawio` extension). Configurable Draw.io server via `DRAWIO_URL` (defaults to public Draw.io).

### Feature 18.1.3 — Excalidraw

Excalidraw embed and editor (`excalidraw` extension).

### Feature 18.1.4 — Diagram types covered

Flowcharts · Sequence diagrams · Architecture diagrams · ERD diagrams · Mind maps · Process maps.

### Feature 18.1.5 — AI-generated diagrams (planned)

"Generate a sequence diagram for the login flow" produces editable Mermaid.

## Epic 18.2 — Diagram Lifecycle

### Feature 18.2.1 — Edit / preview modes

Each diagram block has clear edit and preview states. Saved on commit.

### Feature 18.2.2 — Diagram in version history

Diagrams version with the page; restoring a page version restores diagrams.

### Feature 18.2.3 — Diagram in exports

PDF, HTML, and Markdown exports include rendered diagram images. Server-side rendering invokes the appropriate renderer per format.

## Cross-references

- Editor architecture: [`../architecture/editor.md`](../architecture/editor.md)
- Editor extensions reference: [`../reference/editor-extensions.md`](../reference/editor-extensions.md)
- Env vars: [`../deployment/environment-variables.md`](../deployment/environment-variables.md) (`DRAWIO_URL`)
