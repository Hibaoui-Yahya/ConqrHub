# Legacy documents (preserved verbatim)

These three files were the original docs/ contents before the directory was restructured. They are kept here unchanged so:

1. Nothing the original authors wrote is lost.
2. Anyone bookmarking or linking the old paths can still trace where the content went.
3. Diff-checks against the new structure can confirm fidelity.

**Do not edit these files.** Make all new edits in the topic-specific files under `docs/product/`, `docs/architecture/`, `docs/admin/`, `docs/reference/`, or `docs/prd/`.

| Legacy file | Where its content now lives |
|---|---|
| `product-documentation.md` (≈ 1,800 lines, sections 1–26) | Split across [`product/`](../product/README.md), [`architecture/`](../architecture/README.md), [`admin/`](../admin/README.md), and [`reference/`](../reference/README.md). |
| `enterprise-features.md` (≈ 1,277 lines) | Split across [`architecture/feature-gating.md`](../architecture/feature-gating.md), [`architecture/enterprise-edition.md`](../architecture/enterprise-edition.md), the per-feature deep-dives in [`architecture/`](../architecture/README.md), the admin runbooks in [`admin/`](../admin/README.md), and [`reference/`](../reference/README.md). |
| `product-requirements-user-stories-functional-spec.md` (≈ 13,500 lines, Product Areas 1–34) | Split into one file per Product Area under [`prd/`](../prd/README.md). |

If you find a discrepancy between the new structure and these originals, the originals are the source of truth for the original authors' intent — but the new docs may be more accurate where they have been verified against the codebase.
