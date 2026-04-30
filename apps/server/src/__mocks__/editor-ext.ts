// Jest mock for @docmost/editor-ext — prevents loading ESM-only transitive deps
// (image-dimensions, marked) in unit test environments.

const stubExt = {};
const configurableExt = { configure: jest.fn().mockReturnValue(stubExt) };

// Tiptap extensions used by collaboration.util.ts and page.service.ts
export const Heading = configurableExt;
export const Callout = stubExt;
export const Comment = stubExt;
export const CustomCodeBlock = configurableExt;
export const Details = stubExt;
export const DetailsContent = stubExt;
export const DetailsSummary = stubExt;
export const LinkExtension = configurableExt;
export const MathBlock = stubExt;
export const MathInline = stubExt;
export const TableHeader = stubExt;
export const TableCell = stubExt;
export const TableRow = stubExt;
export const CustomTable = configurableExt;
export const TiptapImage = configurableExt;
export const TiptapVideo = configurableExt;
export const TiptapAudio = configurableExt;
export const TiptapPdf = configurableExt;
export const TrailingNode = configurableExt;
export const Attachment = configurableExt;
export const Drawio = configurableExt;
export const Excalidraw = configurableExt;
export const Embed = configurableExt;
export const Mention = configurableExt;
export const Subpages = configurableExt;
export const Highlight = configurableExt;
export const UniqueID = configurableExt;
export const Columns = stubExt;
export const Column = stubExt;
export const Status = configurableExt;

// Utility functions used by server code
export const addUniqueIdsToDoc = jest.fn((doc: any) => doc);
export const htmlToMarkdown = jest.fn().mockReturnValue('');
export const markdownToHtml = jest.fn().mockResolvedValue('<p></p>');
