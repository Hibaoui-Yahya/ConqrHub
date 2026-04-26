# PRD 10 — Templates (Core)

> **Source:** lines 1038–1091.
> **Scope:** This file is the authoritative spec for the **core template feature** (library, lifecycle, schema). Categories, AI generation, versioning, and broader documentation-standards work live in [`./17-templates-and-standards.md`](./17-templates-and-standards.md), which extends this spec.

## Area overview

Templates standardize documentation quality. `Feature.TEMPLATES` (Business+).

## Epic 10.1 — Templates

### Feature 10.1.1 — Template Library

**User stories.**
- Create reusable templates for common document types.
- Choose a template when creating a page.
- Standardize structure across teams.

**Acceptance criteria.**
- Workspace and space-level templates.
- Searchable, categorizable.
- Page-from-template flow on page creation.
- Restrictable to admins.

**Functional requirements.**
Create · Edit · Delete · Use template to create page · Preview · Workspace-level + space-level · Search · Restrict creation. (Categorization, AI-generation, and versioning are extensions covered in PRD 17.)

## Recommended templates

Product Requirements Document · Technical Specification · Architecture Decision Record · API Documentation · Database Schema Documentation · Standard Operating Procedure · Incident Report · Postmortem · Meeting Notes · Onboarding Guide · Client Project Brief · Security Policy · HR Policy · Release Notes · QA Test Plan · Deployment Guide · Runbook · Troubleshooting Guide · Integration Guide · User Manual · Admin Manual.

## Schema

The `templates` table:

- `content JSONB` (ProseMirror)
- `ydoc BYTEA` (Yjs collaborative state)
- `text_content TEXT` + `tsv TSVECTOR` (full-text indexed)
- `space_id` (nullable — null = workspace-level)
- `creator_id`, `last_updated_by_id`, `collaborator_ids UUID[]`

See [`../reference/database-schema.md`](../reference/database-schema.md).

## Cross-references

- Standards & quality: [`./17-templates-and-standards.md`](./17-templates-and-standards.md)
- Admin: [`../admin/settings-map.md`](../admin/settings-map.md)
