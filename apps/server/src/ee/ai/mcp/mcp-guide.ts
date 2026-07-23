/**
 * ConqrHub MCP "skill" content.
 *
 * This is how we teach any MCP client (Claude, ChatGPT, etc.) to use the
 * ConqrHub tools well, in three layers:
 *
 *  1. SERVER_INSTRUCTIONS — a compact, always-loaded playbook returned on the
 *     `initialize` handshake. The client injects it into the model's context,
 *     so it is present for every turn. Keep it tight.
 *  2. GUIDE_SECTIONS — deeper, on-demand how-tos, exposed both as MCP
 *     resources (`conqrhub://guide/<slug>`) and via the `get_conqrhub_guide`
 *     tool, so clients that surface neither prompts nor resources still work.
 *  3. MCP_PROMPTS — reusable, parameterised multi-tool workflows surfaced as
 *     slash-command / starter prompts.
 *
 * All content references REAL registered tool names — keep it in sync when
 * tools are added or renamed.
 */

export const SERVER_INSTRUCTIONS = `ConqrHub is the ConqrAI suite's collaborative wiki and knowledge base: a workspace of spaces → pages → rich content, with file attachments, comments, and Excalidraw/Drawio diagrams. It also cross-links to ConqrPlane (project management). These tools let you read and edit that knowledge — use them instead of guessing.

CORE RULES
- Ground every answer in real content. Before answering anything about the user's workspace, call rag_retrieve (semantic search over indexed knowledge) or search_pages (keyword/title search). Never invent page ids, space slugs, or facts.
- Knowledge-base gate: rag_retrieve / Ask HR only return VERIFIED pages. Creating or editing a page does NOT index it, and editing a verified page resets it to draft and drops it from RAG. If a search returns nothing, check get_verification_status / list_unverified_pages and use verify_page to make content retrievable — do not assume "indexing lag".
- To SEE or READ a file, use read_attachment: images come back as viewable pictures; PDFs and Word docs come back as extracted text; text/markdown/CSV/JSON are returned inline. Find attachment ids with list_page_attachments or search_attachments. Use read_page_media to view every image on a page at once.
- Use get_current_user when you need the caller's name, email, role, or the "me" context; list_workspace_members to resolve other people.
- Writes mutate real data for everyone in the workspace. create_/update_/delete_/move_/duplicate_ tools are not reversible from here — confirm intent before deleting or overwriting. Prefer update_page_content (body) and update_page_title (title) over a blind update_page.
- Diagrams: add_diagram authors a Mermaid diagram (flowchart, sequence, class, state, ERD, gantt, mindmap, gitGraph, pie) as a code block on a page — it is the only diagram type creatable here. Excalidraw and Drawio drawings are hand-authored on the ConqrHub web canvas and cannot be created via MCP, but you CAN read existing ones as images via read_attachment or read_page_media.
- Project management (tasks/issues/cycles) lives in ConqrPlane, not in pages: list_conqrplane_projects, get_project_cycles, search_work_items, get_work_item, create_work_item.

TYPICAL FLOWS
- "What do our docs say about X?" → rag_retrieve → get_page for the top hits → answer with citations (page titles + ids).
- "Summarize space Y" → list_spaces → list_space_pages → get_page on the key pages.
- "Read this PDF / look at this diagram" → list_page_attachments → read_attachment.
- "Write up Z" → search_pages first (avoid duplicates) → create_page → optionally add_diagram.
- "What's the status of project P?" → list_conqrplane_projects → get_project_cycles / search_work_items.

DEEPER GUIDANCE
Call get_conqrhub_guide (topic = search | pages | attachments | diagrams | conqrplane | comments | spaces | verification), or read the conqrhub://guide/* resources, for detailed how-tos. Common jobs are also available as ready-made prompts (research-topic, draft-page, summarize-space, review-attachment, diagram-from-description, verify-space).`;

export interface GuideSection {
  slug: string;
  title: string;
  description: string;
  body: string;
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    slug: 'overview',
    title: 'ConqrHub overview',
    description: 'What ConqrHub is and how the tools map to it.',
    body: `ConqrHub organises knowledge as: workspace → spaces → pages (tree of parent/child) → page content (rich text), with attachments, comments, and diagrams hanging off pages.

Tool groups:
- Search & RAG: rag_retrieve, search_pages, search_attachments, search_work_items
- Pages (read): get_page, get_page_breadcrumbs, get_page_history, list_child_pages, list_recent_pages, list_space_pages, list_page_attachments
- Pages (write): create_page, update_page, update_page_content, update_page_title, delete_page, move_page, duplicate_page, copy_page_to_space, move_page_to_space, add_diagram
- Attachments & media: read_attachment, read_page_media, list_page_attachments, search_attachments
- Spaces: list_spaces, get_space, get_space_info (read); create_space, update_space (write)
- Comments: get_comments, get_page_comments (read); create_comment, update_comment, delete_comment (write)
- People: get_current_user, list_workspace_members
- ConqrPlane (project mgmt): list_conqrplane_projects, get_project_cycles, get_work_item, search_work_items, create_work_item
- Verification (controls RAG eligibility): get_verification_status, list_unverified_pages, verify_page, create_verification, submit_for_approval, mark_obsolete

Golden rule: read before you write, and cite what you read.`,
  },
  {
    slug: 'search',
    title: 'Finding knowledge (search & RAG)',
    description: 'How to locate the right pages and files before answering.',
    body: `Two complementary search tools:
- rag_retrieve — semantic retrieval over indexed workspace knowledge. Use for conceptual questions ("what's our refund policy?"). Returns the most relevant passages; follow up with get_page to read the full page and cite it.
- search_pages — keyword / title match. Use when you know a term, page name, or want to check whether something already exists before creating it.

For files, use search_attachments (by filename/type) and for project work, search_work_items.

Best practice: never answer a workspace question from memory. Retrieve first, then read the source page, then cite it (title + page id). If retrieval returns nothing, say so rather than inventing an answer.`,
  },
  {
    slug: 'pages',
    title: 'Reading and editing pages',
    description: 'Navigating the page tree and safely making changes.',
    body: `Reading: get_page (full content + metadata), get_page_breadcrumbs (where it sits in the tree), list_child_pages / list_space_pages (navigate), list_recent_pages (what changed lately), get_page_history (past versions).

Writing (mutates shared data — confirm intent first):
- create_page — new page; check with search_pages first to avoid duplicates.
- update_page_title / update_page_content — targeted edits; PREFER these over update_page so you don't accidentally blank a field.
- move_page / move_page_to_space / copy_page_to_space / duplicate_page — reorganise.
- delete_page — destructive; confirm before calling.

When editing content, fetch the current page first so you preserve structure rather than overwriting blindly.`,
  },
  {
    slug: 'attachments',
    title: 'Reading files, images, and documents',
    description: 'How to actually see images and read PDFs/Word/text.',
    body: `read_attachment returns real content to the conversation:
- Images (png/jpg/gif/webp) → viewable image blocks you can analyse directly.
- SVG / Excalidraw / Drawio → rasterised to PNG so you can see the drawing.
- PDF and Word (.docx) → text extracted on the fly (or from ConqrHub's index) so you can read them even if they were never indexed.
- text / markdown / csv / json → returned inline.
Files over 5 MB are summarised, not inlined; scanned/image-only PDFs may yield little text.

Discover ids first: list_page_attachments (everything on a page, with a kind hint) or search_attachments (across the workspace). To review every image on a page in one call, use read_page_media (up to 8 images).`,
  },
  {
    slug: 'diagrams',
    title: 'Creating and reading diagrams',
    description: 'Mermaid (creatable) and Excalidraw / Drawio (read-only) on pages.',
    body: `add_diagram authors a MERMAID diagram only. Pass the raw Mermaid source (no \`\`\` fences — the tool adds them) as \`source\`; it is appended (or prepended) to the page body as a mermaid code block. Mermaid covers flowchart, sequence, class, state, ERD, gantt, mindmap, gitGraph, and pie. This is the only diagram type that can be created programmatically.

Excalidraw and Drawio drawings are hand-authored on the ConqrHub web canvas — there is NO MCP endpoint to create or edit them. You CAN read existing ones: read_attachment (or read_page_media) rasterises SVG/Excalidraw/Drawio to PNG so you can see them like any other image. So the iterate-on-a-drawing flow is read-only from here; to change an Excalidraw/Drawio drawing, the user edits it on the canvas.`,
  },
  {
    slug: 'conqrplane',
    title: 'Project management (ConqrPlane)',
    description: 'Tasks, issues, and cycles — separate from wiki pages.',
    body: `Project/task work is NOT stored as wiki pages. Use the ConqrPlane tools:
- list_conqrplane_projects — available projects.
- get_project_cycles — sprints/cycles for a project.
- search_work_items / get_work_item — find and read tasks/issues.
- create_work_item — create a task/issue (a write — confirm intent).

Use these when the user asks about status, tasks, sprints, or issues. Use pages/spaces for documentation and knowledge.`,
  },
  {
    slug: 'comments',
    title: 'Comments',
    description: 'Reading and writing page discussion.',
    body: `Read discussion with get_page_comments (a page's thread) or get_comments. Add or edit with create_comment / update_comment, and delete_comment (destructive — confirm). Comments are user-visible; write them as you would a teammate's note, and attribute context clearly.`,
  },
  {
    slug: 'spaces',
    title: 'Spaces',
    description: 'The top-level containers for pages.',
    body: `Spaces group pages (e.g. a team or project area). list_spaces to enumerate, get_space / get_space_info for details and membership. create_space / update_space are administrative writes — confirm intent, and don't create a space when a page in an existing space would do.`,
  },
  {
    slug: 'verification',
    title: 'Verification (what makes a page retrievable)',
    description: 'How pages enter and leave the knowledge base.',
    body: `The knowledge base (rag_retrieve / Ask HR) contains ONLY verified pages. A page is retrievable exactly when its verification status is "verified" (or "expiring" but not past its expiry). Everything else — no verification, draft, in_approval, approved, expired, obsolete — is invisible to retrieval.

Key rules:
- Creating or editing a page does NOT index it. Editing a verified page resets it to draft and removes it from RAG until re-verified.
- To make a page retrievable: verify_page (one step — auto-creates a verification with you as verifier if none exists, then verifies). Retrieval is available seconds later (embeddings are async).
- To see state: get_verification_status (one page) or list_unverified_pages (everything not yet retrievable, optionally per space).
- QMS flow: create_verification (draft) -> submit_for_approval -> verify_page (approve) -> verify_page again (final verify).
- To remove a page from the knowledge base: mark_obsolete.
- Permissions: verifying/creating/obsoleting requires space-manage (or workspace-manage). If you get a permission error, the API user needs manage rights on that space.`,
  },
];

export interface McpPromptArg {
  name: string;
  description: string;
  required?: boolean;
}

export interface McpPromptDef {
  name: string;
  title: string;
  description: string;
  arguments: McpPromptArg[];
  /** Build the user-message text from supplied arguments. */
  build: (args: Record<string, string>) => string;
}

const arg = (v: Record<string, string>, k: string, fallback = '') =>
  (v?.[k] ?? '').trim() || fallback;

export const MCP_PROMPTS: McpPromptDef[] = [
  {
    name: 'research-topic',
    title: 'Research a topic in the wiki',
    description:
      'Search ConqrHub knowledge for a topic and synthesise a cited answer.',
    arguments: [
      { name: 'topic', description: 'The topic or question to research.', required: true },
    ],
    build: (v) =>
      `Research this topic using ConqrHub: "${arg(v, 'topic', '<topic>')}".\n\n` +
      `Steps:\n` +
      `1. Call rag_retrieve for the topic; if thin, also try search_pages with key terms.\n` +
      `2. Open the most relevant pages with get_page.\n` +
      `3. Synthesise a clear answer and cite each source as "Page Title (id)".\n` +
      `If nothing relevant is found, say so plainly — do not invent facts.`,
  },
  {
    name: 'draft-page',
    title: 'Draft a new wiki page',
    description: 'Create a well-structured new page, avoiding duplicates.',
    arguments: [
      { name: 'title', description: 'Title of the page to create.', required: true },
      { name: 'notes', description: 'Raw notes / bullet points to base it on.', required: false },
      { name: 'space', description: 'Target space name or slug (optional).', required: false },
    ],
    build: (v) =>
      `Draft a new ConqrHub page titled "${arg(v, 'title', '<title>')}".\n\n` +
      (arg(v, 'space') ? `Target space: ${arg(v, 'space')}.\n` : '') +
      (arg(v, 'notes') ? `Base it on these notes:\n${arg(v, 'notes')}\n\n` : '\n') +
      `Steps:\n` +
      `1. search_pages first to make sure it doesn't already exist (offer to update instead if it does).\n` +
      `2. If needed, list_spaces to pick the right space.\n` +
      `3. create_page with clear headings and structure.\n` +
      `4. Add an add_diagram only if a diagram genuinely helps.\n` +
      `Confirm the target space with me before creating.`,
  },
  {
    name: 'summarize-space',
    title: 'Summarise a space',
    description: 'Give an overview of the pages in a space.',
    arguments: [
      { name: 'space', description: 'Space name or slug to summarise.', required: true },
    ],
    build: (v) =>
      `Summarise the ConqrHub space "${arg(v, 'space', '<space>')}".\n\n` +
      `Steps:\n` +
      `1. list_spaces to resolve the space, then get_space_info.\n` +
      `2. list_space_pages to see its pages.\n` +
      `3. get_page on the most important pages and produce a structured summary ` +
      `(purpose, key pages, notable gaps). Cite page titles + ids.`,
  },
  {
    name: 'review-attachment',
    title: 'Review a file or diagram',
    description: 'Read an attachment (image, PDF, Word, diagram) and analyse it.',
    arguments: [
      { name: 'attachmentId', description: 'Attachment id, if known.', required: false },
      { name: 'hint', description: 'Filename or page to locate it, if id unknown.', required: false },
    ],
    build: (v) =>
      arg(v, 'attachmentId')
        ? `Read attachment ${arg(v, 'attachmentId')} with read_attachment and analyse its content.`
        : `Find and review an attachment (${arg(v, 'hint', 'describe what to look for')}).\n` +
          `Use search_attachments or list_page_attachments to locate it, then read_attachment to view/read it, then analyse.`,
  },
  {
    name: 'diagram-from-description',
    title: 'Add a Mermaid diagram to a page',
    description: 'Create a Mermaid diagram on a page from a description.',
    arguments: [
      { name: 'pageId', description: 'Page to add the diagram to.', required: true },
      { name: 'description', description: 'What the diagram should show.', required: true },
    ],
    build: (v) =>
      `Add a Mermaid diagram to page ${arg(v, 'pageId', '<pageId>')} using add_diagram (type "mermaid").\n` +
      `The diagram should show: ${arg(v, 'description', '<describe the diagram>')}.\n` +
      `Pick the best Mermaid kind (flowchart, sequence, state, ERD, etc.), pass the raw source without \`\`\` fences, then get_page to confirm the block was added.\n` +
      `Note: Excalidraw/Drawio drawings cannot be created here — only Mermaid.`,
  },
  {
    name: 'verify-space',
    title: 'Verify all pages in a space',
    description:
      'Find every unverified page in a space and verify them so they become retrievable.',
    arguments: [
      { name: 'space', description: 'Space name, slug, or id to verify.', required: true },
    ],
    build: (v) =>
      `Verify all unverified pages in the ConqrHub space "${arg(v, 'space', '<space>')}" so they enter the knowledge base.\n\n` +
      `Steps:\n` +
      `1. list_spaces to resolve the space id if you were given a name/slug.\n` +
      `2. list_unverified_pages with that spaceId to see what is not yet retrievable.\n` +
      `3. Show me the list and confirm before proceeding.\n` +
      `4. For each page, call verify_page.\n` +
      `5. Report which pages are now verified (and any that failed on permissions).`,
  },
];
