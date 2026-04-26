# PRD 17 — Templates & Documentation Standards (Extensions)

> **Source:** PA 17, lines 5220–5346.
> **Scope:** This file extends [`./10-templates.md`](./10-templates.md) (core template feature) with categorization, AI generation, versioning, and documentation-standards work. The core library/lifecycle/schema is **not** repeated here — read PRD 10 first.

## Area overview

Templates plus the broader concept of *documentation standards* — guidance + structure that keeps content uniform across the org.

## Epic 17.1 — Template extensions

These features build on PRD 10's template library:

### Feature 17.1.1 — Template categories

Group templates by domain (Product, Engineering, HR, Operations, Legal). Surface relevant templates first when creating a page in the matching space.

### Feature 17.1.2 — AI-generated templates (planned)

Generate a template from a brief: "Onboarding for engineering interns" → produces a structured template with sections.

### Feature 17.1.3 — Template versioning (planned)

Templates can drift over time — track versions and let admins propagate updates to pages created from the template.

## Epic 17.2 — Documentation Standards

### Feature 17.2.1 — Style guides

Workspace-wide style notes that surface in the editor (planned). E.g.:
- Use second person ("you", not "the user")
- Heading level 1 reserved for page title
- Avoid acronyms without expansion on first use

### Feature 17.2.2 — Required sections

Templates can mark sections as required so AI / linting can flag missing structure.

### Feature 17.2.3 — Glossary

Workspace glossary used by AI for context awareness and by the editor for tooltip hover-definitions.

## Cross-references

- Core templates: [`./10-templates.md`](./10-templates.md)
- AI assistant: [`./08-ai-assistant-and-chat.md`](./08-ai-assistant-and-chat.md)
- Reference (schema): [`../reference/database-schema.md`](../reference/database-schema.md) (`templates`)
