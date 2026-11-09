export enum AttachmentType {
  Avatar = 'avatar',
  WorkspaceIcon = 'workspace-icon',
  SpaceIcon = 'space-icon',
  SpaceCover = 'space-cover',
  File = 'file',
  Chat = 'chat',
}

export const validImageExtensions = ['.jpg', '.png', '.jpeg'];
export const MAX_AVATAR_SIZE = '10MB';

export const inlineFileExtensions = [
  '.jpg',
  '.png',
  '.jpeg',
  '.pdf',
  '.mp4',
  '.mov',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.webm',
];

/**
 * Page documents whose text is extracted for search and the verified
 * knowledge base (see ee/attachments-ee). Images are recorded at upload and
 * only OCR'd once their page is verified.
 */
export const textExtractableExtensions = [
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
];
