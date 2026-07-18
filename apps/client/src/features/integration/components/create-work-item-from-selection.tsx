import { useAtom } from "jotai";
import { useParams } from "react-router-dom";
import { extractPageSlugId } from "@/lib";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { useSpaceMappings } from "@/features/integration/queries/integration-query";
import { createWorkItemDraftAtom } from "@/features/integration/atoms/create-work-item-atom";
import { LinkOrCreateWorkItem } from "./link-or-create-work-item";

/**
 * Page-scoped host for the create-work-item-from-selection modal (§5.1A).
 * Mounted once in the page editor; the bubble-menu action opens it via the
 * shared draft atom, and this wrapper supplies the current page URN and the
 * space's mapped Plane project.
 */
export function CreateWorkItemFromSelection() {
  const [draft, setDraft] = useAtom(createWorkItemDraftAtom);
  const { pageSlug } = useParams();
  const slugId = extractPageSlugId(pageSlug);
  const { data: page } = usePageQuery({ pageId: slugId });
  const { data: mappings } = useSpaceMappings(
    draft.open ? page?.spaceId : undefined,
  );
  const primaryProjectId = mappings?.find(
    (m) => m.mappingKind === "primary",
  )?.planeProjectId;

  if (!page?.id) return null;

  return (
    <LinkOrCreateWorkItem
      sourceUrn={`conqr://hub/page/${page.id}`}
      planeProjectId={primaryProjectId}
      opened={draft.open}
      initialTitle={draft.title}
      onClose={() => setDraft({ open: false, title: "" })}
    />
  );
}
