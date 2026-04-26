# Public Sharing

How to control who can share what publicly. The sharing capabilities themselves are Business+; the *control* over them is `Feature.SHARING_CONTROLS` (Business+).

## What sharing means

A **public share** is a URL that lets non-authenticated visitors read a page or browse a space. By default, public sharing requires an explicit per-page action — pages are not public by default.

## Sharing a page (per-page)

A space writer (or admin) clicks **Share** on a page:

- **Create public link** — generates a URL with a unique token.
- **Optional password** — required to view (Business+).
- **Optional expiration** — auto-revoked after the date.
- **Allow indexing by search engines** — controls `<meta robots>`.
- **Remove branding** — hide "Powered by ConqrAI Wiki" on the public page (Business+).

Audit events: `SHARE_CREATED`, `SHARE_DELETED`.

## Sharing a space (public docs portal)

A space admin can publish the entire space at a custom path / domain:

- **Settings → Space → Public Sharing**
- Enable public space → choose subpath or custom domain
- Configure navigation, branding, SEO meta
- Add a public feedback form (optional)

The result is a **read-only documentation portal** — like GitBook or Notion's public sites — backed by your spaces.

## Workspace-level controls

`Feature.SHARING_CONTROLS` adds workspace-level governance.

### Disable workspace-wide

**Settings → Public Sharing → Disable public sharing for entire workspace**.

When toggled on:
- All `Create public link` actions are blocked.
- Existing share links are deleted (with a confirmation that warns of breakage).
- Public space portals are taken offline.

This is a "kill switch" for incident response.

### Disable per space

**Settings → Workspace → Spaces → [space] → Disable public sharing for this space.**

Same as workspace-wide but scoped. Common for HR / finance / legal spaces.

### Restrict who can share

(Planned — currently any space writer can create share links. Future setting will restrict to admins or to verified pages only.)

### Branding removal

**Settings → Public Sharing → Remove branding** (Business+). Removes the "Powered by" footer from public pages and the docs portal.

## How public access is enforced

Even when a page is shared:

- The share token authorizes **only that specific page (or space)**.
- Internal links from shared pages to non-shared pages 404 (or, if "show full tree" is enabled for the share, are filtered out).
- Comments on shared pages are subject to **viewer-comment** policy (`Feature.VIEWER_COMMENTS`).
- Search on a public docs portal indexes only the public space's content.

## Audit and analytics

- **Audit:** every share creation and revocation is logged. See [`./audit-logs.md`](./audit-logs.md).
- **Analytics:** track public link views (planned full UI; today the data is captured).

## Common runs

### Audit all public links in the workspace

**Settings → Public Sharing → All shares** lists every active share with the page, owner, expiration, and last viewed.

Filter and revoke in bulk during quarterly access reviews.

### Off-boarding a customer

Filter shares by space (the customer's space) and revoke. The space itself can also be archived.

### Incident response: leak suspected

Toggle **Disable public sharing for entire workspace** in Settings → Public Sharing. All public access stops immediately.

## Best practices

- **Default to internal.** Don't share by default; share by exception.
- **Use expirations.** Especially for client-facing or marketing-page shares.
- **Audit quarterly.** Run the all-shares list and remove anything unused.
- **Use space portals for stable customer-facing docs**; use per-page shares for one-offs.
- **Disable per-space sharing for sensitive spaces** even if you trust everyone — defense in depth.

## API

```
POST  /shares           List shares
POST  /shares/create    Create
POST  /shares/update    Update password / expiration
POST  /shares/delete    Revoke
```

See [`../reference/api.md`](../reference/api.md).

## Related

- Audit events: [`../reference/audit-events.md`](../reference/audit-events.md)
- Permission matrix: [`../reference/permission-matrix.md`](../reference/permission-matrix.md)
- Public sharing PRD: [`../prd/13-public-sharing-and-external-access.md`](../prd/13-public-sharing-and-external-access.md)
