import { ActionIcon, Tooltip } from "@mantine/core";
import {
  IconDownload,
  IconFileText,
  IconPaperclip,
  IconPencil,
  IconPhoto,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { usePageAttachmentsQuery } from "@/features/attachments/queries/attachment-query.ts";
import {
  IPageAttachment,
  PageAttachmentKind,
} from "@/features/attachments/types/attachment.types.ts";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import PageListSkeleton from "@/components/ui/page-list-skeleton.tsx";
import { formatBytes } from "@/lib";
import classes from "./page-attachments-panel.module.css";

const KIND_ICONS: Record<PageAttachmentKind, typeof IconPaperclip> = {
  image: IconPhoto,
  document: IconFileText,
  drawing: IconPencil,
  other: IconPaperclip,
};

function AttachmentRow({ attachment }: { attachment: IPageAttachment }) {
  const { t } = useTranslation();
  const KindIcon = KIND_ICONS[attachment.kind] ?? IconPaperclip;
  const fileUrl = `/api/files/${attachment.id}/${encodeURIComponent(
    attachment.fileName,
  )}`;

  return (
    <li>
      <a
        className={classes.row}
        href={fileUrl}
        target="_blank"
        rel="noreferrer"
      >
        <span className={classes.kindIcon}>
          <KindIcon size={16} stroke={1.75} />
        </span>
        <span className={classes.name}>{attachment.fileName}</span>
        {attachment.fileSize != null && (
          <span className={classes.size}>
            {formatBytes(attachment.fileSize)}
          </span>
        )}
        <span className={classes.download}>
          <Tooltip label={t("Download attachment")} openDelay={250} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              component="span"
              aria-label={t("Download attachment")}
            >
              <IconDownload size={16} />
            </ActionIcon>
          </Tooltip>
        </span>
      </a>
    </li>
  );
}

interface PageAttachmentsPanelProps {
  pageId?: string;
}

/**
 * Plane-style page attachments list (aside panel): every file, image and
 * drawing attached to the current page, dense hover rows with a
 * hover-revealed download affordance.
 */
export default function PageAttachmentsPanel({
  pageId,
}: PageAttachmentsPanelProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = usePageAttachmentsQuery(pageId);

  if (!pageId || isLoading) {
    return <PageListSkeleton />;
  }

  if (isError) {
    return (
      <EmptyState
        variant="error"
        title={t("Failed to load attachments")}
        description={t("Please try again.")}
      />
    );
  }

  if (!data || data.attachments.length === 0) {
    return (
      <EmptyState
        icon={IconPaperclip}
        title={t("No attachments")}
        description={t("Files added to this page will show up here.")}
      />
    );
  }

  return (
    <ul className={classes.list}>
      {data.attachments.map((attachment) => (
        <AttachmentRow key={attachment.id} attachment={attachment} />
      ))}
    </ul>
  );
}
