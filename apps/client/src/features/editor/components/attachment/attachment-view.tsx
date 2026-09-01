import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Group, ActionIcon, Loader, Tooltip } from "@mantine/core";
import { getFileUrl } from "@/lib/config.ts";
import {
  IconDownload,
  IconFileTypePdf,
  IconPaperclip,
} from "@tabler/icons-react";
import { useHover } from "@mantine/hooks";
import { formatBytes } from "@/lib";
import { useTranslation } from "react-i18next";
import { useCallback } from "react";
import classes from "./attachment-view.module.css";

export default function AttachmentView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { editor, node, getPos, selected } = props;
  const { url, name, size, mime, attachmentId, placeholder } = node.attrs;
  const { hovered, ref } = useHover();

  const isPdf =
    mime === "application/pdf" || name?.toLowerCase().endsWith(".pdf");

  const handleEmbedAsPdf = useCallback(() => {
    const pos = getPos();
    if (pos === undefined || !url) return;

    const nodeSize = node.nodeSize;

    editor
      .chain()
      .insertContentAt(
        { from: pos, to: pos + nodeSize },
        {
          type: "pdf",
          attrs: {
            src: url,
            name,
            attachmentId,
            size,
          },
        },
      )
      .run();
  }, [editor, getPos, node, url, name, attachmentId]);

  return (
    <NodeViewWrapper>
      <div className={classes.row} ref={ref} data-drag-handle>
        <span className={classes.kindIcon}>
          {!url && placeholder ? (
            <Loader size={16} />
          ) : (
            <IconPaperclip size={16} stroke={1.75} />
          )}
        </span>

        <span className={classes.name}>
          {!url && placeholder ? t("Uploading {{name}}", { name }) : name}
        </span>

        <span className={classes.size}>{formatBytes(size)}</span>

        <span className={classes.spacer} />

        {url && (selected || hovered) && (
          <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
            {isPdf && editor.isEditable && (
              <Tooltip
                label={t("Embed as PDF")}
                position="top"
                withinPortal={false}
              >
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={t("Embed as PDF")}
                  onClick={handleEmbedAsPdf}
                >
                  <IconFileTypePdf size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            <a href={getFileUrl(url)} target="_blank" rel="noreferrer">
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="download file"
              >
                <IconDownload size={16} />
              </ActionIcon>
            </a>
          </Group>
        )}
      </div>
    </NodeViewWrapper>
  );
}
