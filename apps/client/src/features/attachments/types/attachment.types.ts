export interface IAttachment {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileExt: string;
  mimeType: string;
  type: string;
  creatorId: string;
  pageId: string | null;
  spaceId: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type PageAttachmentKind = "image" | "document" | "drawing" | "other";

/* Row shape returned by POST /attachments/list (page attachments panel). */
export interface IPageAttachment {
  id: string;
  fileName: string;
  mimeType: string | null;
  kind: PageAttachmentKind;
  fileSize: number | null;
  createdAt: string;
}

export interface IPageAttachmentsResponse {
  pageId: string;
  count: number;
  attachments: IPageAttachment[];
}

export enum AvatarIconType {
  AVATAR = "avatar",
  SPACE_ICON = "space-icon",
  SPACE_COVER = "space-cover",
  WORKSPACE_ICON = "workspace-icon",
}

export enum AttachmentType {
  AVATAR = "avatar",
  WORKSPACE_ICON = "workspace-icon",
  SPACE_ICON = "space-icon",
  SPACE_COVER = "space-cover",
  FILE = "file",
}
