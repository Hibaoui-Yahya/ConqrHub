import { Box, ScrollArea, Text } from "@mantine/core";
import CommentListWithTabs from "@/features/comment/components/comment-list-with-tabs.tsx";
import { useAtom } from "jotai";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import React, { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TableOfContents } from "@/features/editor/components/table-of-contents/table-of-contents.tsx";
import { useAtomValue } from "jotai";
import { pageEditorAtom } from "@/features/editor/atoms/editor-atoms.ts";
import AsideChatPanel from "@/ee/ai-chat/components/aside-chat-panel";
import { useParams } from "react-router-dom";
import { extractPageSlugId } from "@/lib";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { useSpaceMappings } from "@/features/integration/queries/integration-query.ts";
import { KnowledgePanel } from "@/features/integration/components/knowledge-panel.tsx";

export default function Aside() {
  const [{ tab }] = useAtom(asideStateAtom);
  const { t } = useTranslation();
  const pageEditor = useAtomValue(pageEditorAtom);

  const { pageSlug } = useParams();
  const slugId = extractPageSlugId(pageSlug);
  const { data: currentPage } = usePageQuery({ pageId: slugId });
  const { data: spaceMappings } = useSpaceMappings(
    tab === "links" ? currentPage?.spaceId : undefined,
  );
  const primaryProjectId = spaceMappings?.find(
    (m) => m.mappingKind === "primary",
  )?.planeProjectId;

  let title: string;
  let component: ReactNode;

  switch (tab) {
    case "comments":
      component = <CommentListWithTabs />;
      title = "Comments";
      break;
    case "toc":
      component = <TableOfContents editor={pageEditor} />;
      title = "Table of contents";
      break;
    case "chat":
      component = <AsideChatPanel />;
      title = "AI Chat";
      break;
    case "links":
      component = currentPage?.id ? (
        <KnowledgePanel
          urn={`conqr://hub/page/${currentPage.id}`}
          planeProjectId={primaryProjectId}
        />
      ) : null;
      title = "Related work & knowledge";
      break;
    default:
      component = null;
      title = null;
  }

  return (
    <Box p="md" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {component && (
        <>
          {tab !== "chat" && (
            <Text mb="md" fw={500}>
              {t(title)}
            </Text>
          )}

          {tab === "comments" || tab === "chat" ? (
            component
          ) : (
            <ScrollArea
              style={{ height: "85vh" }}
              scrollbarSize={5}
              type="scroll"
            >
              <div style={{ paddingBottom: "200px" }}>{component}</div>
            </ScrollArea>
          )}
        </>
      )}
    </Box>
  );
}
