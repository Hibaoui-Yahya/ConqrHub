# PRD 20 — Analytics

> **Source:** PA 20, lines 5524–5659.

## Area overview

Three layers: **workspace dashboard** (admin overview), **per-page analytics** (content owner), and **AI analytics** (AI usage and cost).

## Epic 20.1 — Workspace Analytics Dashboard

### Feature 20.1.1 — Admin dashboard

**Metrics.**
Total users · Active users · Total pages · Total spaces · Total comments · Total attachments · Storage usage · AI usage · Search usage · Public links · Security warnings · Pending reviews · Expired pages.

**UX.** Cards for top-level metrics · Warnings for risks · Drill-down links to filtered views · Trend indicators where possible.

**Technical notes.**
- Calculated from events, audit, and page metadata.
- Expensive metrics precomputed by background jobs.
- Use Redis/BullMQ for scheduled health calculations.

## Epic 20.2 — Page and Space Analytics

### Feature 20.2.1 — Per-page

Views · Unique viewers · Read time · Last viewed · Last edited · Top referrers · Search queries leading to page · Comment count · Unresolved comments · AI citations count.

### Feature 20.2.2 — Per-space

Total pages · Active contributors · Outdated pages · Verified pages · Top viewed · Top edited · Failed searches · Knowledge gaps.

## Epic 20.3 — AI Analytics

### Feature 20.3.1 — AI usage and cost

AI questions asked · AI answers generated · AI failed answers · AI answer feedback (thumbs up/down) · Sources used · Model used · Token usage · Cost estimate · Most asked topics · Most cited pages.

### Feature 20.3.2 — AI feedback loop

Aggregated feedback feeds back into the documentation health score and the knowledge gap detector.

## Status

Workspace dashboard + AI analytics partial. Per-page / per-space analytics planned.

## Cross-references

- Documentation health: [`./21-documentation-health.md`](./21-documentation-health.md)
- AI subsystem: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md)
