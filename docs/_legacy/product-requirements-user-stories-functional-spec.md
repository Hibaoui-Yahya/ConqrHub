ConqrAI Wiki — Product Requirements, User Stories & Functional Specification
0. Document Purpose

This document defines ConqrAI Wiki using a product-management structure:

Product Vision → Product Area / Module → Epic → Feature → User Stories → Acceptance Criteria → Functional Requirements → UX/UI Requirements → Technical Notes → Test Cases

The goal is to describe every important capability deeply enough for product, design, engineering, QA, and business stakeholders to understand what must be built and why.

1. Product Vision
1.1 Vision Statement

ConqrAI Wiki is an AI-powered collaborative wiki and documentation platform for organizations that need trusted, structured, searchable, governed, and continuously improved knowledge.

It is not only a place to write pages. It is a company knowledge operating system that helps teams create documentation, collaborate in real time, search knowledge with AI, validate critical content through human experts, manage permissions, enforce governance, and maintain documentation quality over time.

1.2 Core Product Promise

ConqrAI Wiki helps organizations answer one critical question:

“Can our people find the right trusted knowledge at the right time, and can we prove that this knowledge is accurate, governed, and up to date?”

1.3 Strategic Differentiation

ConqrAI Wiki should differentiate itself through:

Collaborative documentation: modern wiki, rich editor, spaces, comments, templates, real-time editing.
AI-powered knowledge access: AI Search, AI Answers, AI Chat, AI Assistant, source citations.
Human-in-the-loop governance: expert insights, page verification, review workflows, approval states.
Enterprise readiness: SSO, MFA, SCIM, audit logs, permissions, API keys, retention, air-gapped deployment.
Documentation intelligence: documentation health score, knowledge gap detection, outdated content detection, search analytics.
Technical documentation depth: API docs, database docs, architecture docs, runbooks, diagrams, incident documentation.
1.4 Target Customers
SaaS companies
Consulting companies
Engineering organizations
Industrial companies
Aerospace and automotive teams
Customer support teams
HR and operations teams
Regulated organizations needing review/approval workflows
Companies replacing Confluence, Notion, GitBook, or scattered Google Docs
1.5 Primary Personas
Persona 1 — Employee / Knowledge Consumer

Needs to find answers, procedures, policies, and technical information quickly.

Persona 2 — Contributor / Editor

Creates and maintains documentation for a team or project.

Persona 3 — Knowledge Owner

Responsible for accuracy, freshness, and governance of documentation.

Persona 4 — Admin / IT Owner

Manages users, groups, security, SSO, permissions, compliance, and workspace settings.

Persona 5 — Technical Lead / Engineer

Documents APIs, systems, runbooks, architecture decisions, deployment flows, and incidents.

Persona 6 — External Client / Guest

Accesses selected documentation without seeing private workspace content.

2. Product Area: Workspace & Organization
2.1 Epic: Workspace Management
Feature 2.1.1: Workspace Creation and Configuration
Use Case

A company wants to create a dedicated knowledge workspace for all internal documentation, users, spaces, security settings, and AI features.

User Stories
As an organization owner, I want to create a workspace so that my company can centralize documentation.
As an admin, I want to configure workspace branding so that the platform reflects our company identity.
As an admin, I want to define workspace-wide defaults so that new spaces and users follow our governance model.
Acceptance Criteria
A workspace can be created with a name, slug, logo, and default language.
Workspace admins can update general settings.
Workspace settings are persisted and applied across the product.
Only owners/admins can access workspace-level configuration.
Invalid workspace slugs are rejected.
Workspace name and slug must be unique where required.
Functional Requirements
Create workspace.
Edit workspace name.
Edit workspace slug/domain.
Upload workspace logo.
Set default timezone.
Set default language.
Set default member role.
Enable or disable public sharing globally.
Enable or disable AI features globally.
View workspace metadata.
UX/UI Requirements
Workspace settings should be accessible from the main settings sidebar.
Settings must be grouped into clear tabs: General, Members, Security, AI, Billing/License, Audit, Retention.
Destructive actions must require confirmation.
The UI should clearly show which settings are available based on the current plan.
Technical Notes
Workspace settings should be stored as structured JSON where flexible configuration is required.
Permission checks should use CASL or equivalent authorization rules.
Workspace settings should be cached where safe, but security-sensitive settings must always be reliable.
Test Cases
Create a workspace with valid data.
Reject workspace creation with missing required fields.
Reject duplicate slug.
Verify that non-admin users cannot edit workspace settings.
Verify updated logo appears in workspace UI.
Verify disabled features are hidden or locked for users.
Feature 2.1.2: Workspace Health Dashboard
Use Case

Admins and knowledge managers need to understand the health of company documentation and identify risks.

User Stories
As an admin, I want to see workspace activity so that I can understand adoption.
As a knowledge manager, I want to see outdated and unverified pages so that I can improve documentation quality.
As a security owner, I want to see public links and permission risks so that I can reduce exposure.
Acceptance Criteria
Dashboard shows workspace-level metrics.
Metrics are permission-protected.
Dashboard separates content, user, search, AI, and security metrics.
Metrics update automatically or on refresh.
Functional Requirements

Dashboard should include:

Total users.
Active users.
Total spaces.
Total pages.
Pages created this month.
Pages updated this month.
Pages not updated recently.
Pages without owners.
Verified pages.
Expired pages.
Public links.
Failed searches.
AI questions asked.
Storage usage.
API key count.
Pending reviews.
UX/UI Requirements
Use cards for top-level metrics.
Use warning indicators for risks.
Provide drill-down links to filtered pages.
Display trend indicators where possible.
Keep dashboard simple for non-technical admins.
Technical Notes
Analytics can be calculated from events, audit logs, and page metadata.
Expensive metrics should be precomputed through background jobs.
Use Redis/BullMQ for scheduled health calculations.
Test Cases
Admin can view dashboard.
Non-admin cannot view dashboard.
Dashboard counts match database records.
Expired pages appear correctly.
Public link count changes after creating or revoking share links.
3. Product Area: Spaces & Information Architecture
3.1 Epic: Space Management
Feature 3.1.1: Spaces
Use Case

Organizations need to divide knowledge by department, project, client, product, or function.

User Stories
As an admin, I want to create spaces so that documentation is organized by team or domain.
As a team lead, I want a private space so that only my team can access sensitive project documentation.
As a new employee, I want to browse spaces so that I can find relevant knowledge areas.
Acceptance Criteria
Users with permission can create spaces.
Each space has name, slug, icon, description, visibility, and permissions.
Space slugs are unique in a workspace.
Space visibility controls who can see the space.
Deleted spaces are not visible in normal navigation.
Functional Requirements
Create space.
Edit space.
Delete/archive space.
Set icon.
Set description.
Set visibility.
Manage members.
Manage groups.
Configure public sharing.
Configure viewer comments.
Configure templates.
Export space.
View space analytics.
UX/UI Requirements
Spaces should appear in a left sidebar or workspace navigation.
Each space should display icon, name, and access status.
Private/restricted spaces should have clear lock indicators.
Space settings should be easy to access for space admins.
Technical Notes
Space permissions are the default permission layer for pages inside the space.
Page-level permissions can override or restrict access further.
Search indexing must include space metadata.
Test Cases
Create public internal space.
Create private space.
Add a user to a space.
Remove a user from a space.
Verify user without access cannot see the space.
Verify space slug uniqueness.
Feature 3.1.2: Space Permissions
Use Case

A company wants different teams to access different documentation areas with different levels of permission.

User Stories
As a space admin, I want to assign readers and writers so that people have the correct level of access.
As an admin, I want to grant access to groups so that permission management is scalable.
As a security owner, I want restricted spaces so that sensitive content is protected.
Acceptance Criteria
Space admins can add users or groups to a space.
Supported roles include admin, writer, reader, and optionally commenter.
Users without access cannot view restricted space pages.
Permission changes are reflected immediately.
Functional Requirements
Add space member.
Remove space member.
Change member role.
Add group to space.
Remove group from space.
Configure default access.
Support inherited permissions.
Audit permission changes.
UX/UI Requirements
Permission UI should show users and groups separately.
Role dropdown must explain each role.
Dangerous changes should show confirmation.
Users should understand why they have access.
Technical Notes
CASL rules should enforce access on server side.
Frontend checks improve UX but must never replace backend authorization.
Audit log should capture actor, target, role, and resource.
Test Cases
Reader can view but cannot edit.
Writer can edit pages.
Space admin can manage members.
Removed user loses access.
Group member receives access through group assignment.
4. Product Area: Pages & Content Lifecycle
4.1 Epic: Page Management
Feature 4.1.1: Page Creation and Editing
Use Case

A user wants to create structured documentation inside a space.

User Stories
As a contributor, I want to create a page so that I can document knowledge.
As a contributor, I want to edit a page with rich content so that I can create useful documentation.
As a writer, I want autosave so that I do not lose work.
Acceptance Criteria
A user with writer permission can create pages.
A page must belong to a space.
A page can have a parent page.
Page content autosaves.
Unauthorized users cannot edit.
Page metadata updates after edits.
Functional Requirements
Create page.
Edit title.
Edit content.
Add icon.
Add cover.
Save content.
Autosave content.
Duplicate page.
Move page.
Copy page.
Delete page.
Restore page.
Permanently delete page.
UX/UI Requirements
Editor should open quickly.
Save status should be visible.
Page title should be editable inline.
Empty pages should show helpful prompts and templates.
Moving/copying pages should use a searchable picker.
Technical Notes
Page content should be stored as ProseMirror JSON and/or Yjs document state.
Slug generation should be deterministic and collision-safe.
Autosave should debounce writes.
Page content should trigger search indexing jobs.
Test Cases
Writer creates a page.
Reader cannot create a page.
Autosave persists content after refresh.
Duplicate page creates independent copy.
Deleted page moves to trash.
Restored page reappears in tree.
Feature 4.1.2: Page Tree and Hierarchy
Use Case

Teams need to organize pages in a nested structure that reflects projects, processes, and documentation categories.

User Stories
As a user, I want to browse nested pages so that I can understand documentation structure.
As an editor, I want to move pages in the tree so that I can reorganize documentation.
As a user, I want to collapse sections so that navigation stays clean.
Acceptance Criteria
Pages can have parent-child relationships.
Page tree displays nested pages.
Users only see pages they can access.
Moving a page updates its parent and order.
Restricted pages show lock indicators where appropriate.
Functional Requirements
Display page tree.
Expand/collapse tree nodes.
Drag-and-drop reorder.
Move page to parent.
Move page to another space.
Show private/restricted indicator.
Show verification status indicator.
Show favorite/recent pages.
UX/UI Requirements
Tree must be fast and responsive.
Current page should be highlighted.
Drag-and-drop should show drop target clearly.
Restricted pages should not leak titles to unauthorized users.
Technical Notes
Use materialized path, parent ID, or nested set model depending on performance needs.
Permission filtering must happen server-side.
Reordering should be transactional.
Test Cases
Child page appears under parent.
Unauthorized page is hidden.
Drag-and-drop updates order.
Moving a parent preserves children.
Search result opens correct page in tree.
Feature 4.1.3: Page History and Restore
Use Case

Teams need to recover previous versions and understand how documentation changed.

User Stories
As an editor, I want to view page history so that I can recover from mistakes.
As a knowledge owner, I want to compare versions so that I can audit content changes.
As an admin, I want version history so that critical documentation remains trustworthy.
Acceptance Criteria
Page versions are created after meaningful edits.
Users with permission can view history.
Users can restore older versions.
Restore operation creates a new version.
Version history shows editor and timestamp.
Functional Requirements
List versions.
View version snapshot.
Compare versions.
Restore version.
Show editor.
Show timestamp.
Track title/content changes.
UX/UI Requirements
History panel should be accessible from page menu.
Diff view should clearly show additions and removals.
Restore action requires confirmation.
Technical Notes
Store snapshots or deltas depending on scale.
Restoring should not erase audit history.
Yjs snapshots may be used for collaborative state recovery.
Test Cases
Edit page creates version.
Restore previous version.
Verify restored content matches old version.
Unauthorized user cannot view history.
Restore action is audited.
5. Product Area: Rich Editor & Documentation Blocks
5.1 Epic: Modern Documentation Editor
Feature 5.1.1: Rich Text Editing
Use Case

Users need to write structured documents without technical complexity.

User Stories
As a writer, I want formatting tools so that my pages are readable.
As a technical writer, I want code blocks and tables so that I can document technical processes.
As a manager, I want callouts and checklists so that documentation is actionable.
Acceptance Criteria
Editor supports common formatting and rich content blocks.
Slash commands allow quick block insertion.
Content is saved correctly.
Pasted content from common sources is cleaned and preserved where possible.
Functional Requirements

Blocks:

Paragraph.
Headings.
Bullet list.
Numbered list.
Checklist.
Quote.
Divider.
Table.
Image.
File.
Video/embed.
Code block.
Inline code.
Link.
Callout.
Toggle.
Tabs.
Table of contents.
UX/UI Requirements
Slash command menu.
Bubble toolbar.
Floating block menu.
Drag handle.
Keyboard shortcuts.
Markdown shortcuts.
Clean empty state.
Technical Notes
Use Tiptap/ProseMirror extensions.
Shared editor extensions should live in packages/editor-ext.
Server-side rendering/export needs compatible serialization.
Test Cases
Insert each block type.
Save and reload page.
Paste Markdown.
Paste HTML.
Drag block to new position.
Verify content renders correctly in public share/export.
Feature 5.1.2: Diagrams
Use Case

Technical and process documentation often requires diagrams.

User Stories
As an engineer, I want Mermaid diagrams so that I can document systems as code.
As a product manager, I want Draw.io diagrams so that I can visualize workflows.
As a designer, I want Excalidraw diagrams so that I can create quick visual explanations.
Acceptance Criteria
Users can insert supported diagram blocks.
Diagrams render inside pages.
Users can edit diagrams with the right editor.
Diagrams are included in exports where supported.
Functional Requirements
Mermaid block.
Draw.io block.
Excalidraw block.
Diagram preview.
Diagram edit mode.
Diagram export rendering.
UX/UI Requirements
Diagram blocks should have clear edit and preview states.
Invalid Mermaid syntax should show helpful errors.
Diagrams should be responsive.
Technical Notes
Diagram data should be stored inside page content or as attachments.
Export pipeline should render diagrams to images where needed.
Test Cases
Insert Mermaid diagram.
Edit Mermaid code.
Render Draw.io diagram.
Export page with diagram.
Invalid diagram does not break page rendering.
Feature 5.1.3: Technical Documentation Blocks
Use Case

Engineering teams need structured blocks for APIs, databases, architecture, runbooks, and decisions.

User Stories
As an engineer, I want an API endpoint block so that endpoints are documented consistently.
As a data engineer, I want a database schema block so that tables are easy to understand.
As a DevOps engineer, I want runbook blocks so that operational procedures are clear.
As an architect, I want ADR blocks so that decisions are documented over time.
Acceptance Criteria
Users can insert specialized technical blocks.
Each block has structured fields.
Blocks render in a readable format.
Blocks can be searched and exported.
Functional Requirements

API block:

Method.
Endpoint path.
Description.
Auth requirements.
Headers.
Parameters.
Request body.
Response body.
Error responses.
Code examples.

Database block:

Table name.
Description.
Columns.
Types.
Constraints.
Foreign keys.
Indexes.
Example query.

Runbook block:

Objective.
Preconditions.
Steps.
Expected result.
Rollback.
Escalation.

ADR block:

Context.
Decision.
Alternatives.
Consequences.
Status.
Owner.
UX/UI Requirements
Structured blocks should feel easy, not heavy.
Provide default templates for each block.
Allow collapse/expand for long blocks.
Highlight required fields.
Technical Notes
Consider storing structured block attributes separately for indexing and analytics.
AI can later generate these blocks from plain text or code.
Test Cases
Create API block with all fields.
Search finds endpoint path.
Export includes block content.
Required field validation works.
Empty structured block displays placeholder.
6. Product Area: Collaboration
6.1 Epic: Real-Time Collaboration
Feature 6.1.1: Multi-User Editing
Use Case

Multiple team members need to collaborate on documentation simultaneously.

User Stories
As a team member, I want to see who is editing so that I avoid conflicts.
As a writer, I want live updates so that collaboration feels instant.
As a remote team, we want to co-create documentation during meetings.
Acceptance Criteria
Multiple users can edit the same page at the same time.
Each user sees other users' cursors/presence.
Edits are merged without conflicts.
Connection loss is handled gracefully.
Functional Requirements
Real-time document sync.
Cursor presence.
User avatars.
Online/offline status.
Reconnect handling.
Conflict-free CRDT editing.
UX/UI Requirements
Show active collaborators at top of page.
Use colored cursors and labels.
Show connection status when unstable.
Avoid intrusive collaboration UI.
Technical Notes
Use Hocuspocus with Yjs CRDT.
Collaboration endpoint runs at /collab.
Persistence extension stores document state.
Auth extension validates access before joining document.
Test Cases
Two users edit same paragraph.
User disconnects and reconnects.
Unauthorized user cannot connect to collaboration room.
Presence disappears when user leaves.
Concurrent edits persist after refresh.
6.2 Epic: Comments and Feedback
Feature 6.2.1: Inline and Page Comments
Use Case

Users need to ask questions, suggest changes, and discuss documentation without editing the page directly.

User Stories
As a reader, I want to comment on a page so that I can ask for clarification.
As an editor, I want inline comments so that feedback is attached to specific text.
As a reviewer, I want to resolve comments so that completed feedback is tracked.
Acceptance Criteria
Users with comment permission can create comments.
Comments can be inline or page-level.
Users can reply to comments.
Comments can be resolved and reopened.
Mentioned users receive notifications.
Functional Requirements
Create comment.
Edit comment.
Delete comment.
Reply to comment.
Resolve comment.
Reopen comment.
Mention user.
Filter comments by resolved/unresolved.
Notify mentioned users.
UX/UI Requirements
Inline comments should be visually attached to selected text.
Comment sidebar should show all page comments.
Resolved comments should be visually de-emphasized.
Mention autocomplete should be available.
Technical Notes
Inline comment marks should be stored in editor document.
Comment data should exist in database for querying, notifications, and audit.
Resolve state should sync between document marks and backend.
Test Cases
Create inline comment.
Reply to comment.
Resolve comment.
Reopen comment.
Mention user and verify notification.
Reader with no comment permission cannot comment.
Feature 6.2.2: Viewer Comments
Use Case

Read-only users or external clients need to provide feedback without editing content.

User Stories
As a space admin, I want viewers to comment so that I can collect feedback safely.
As a client, I want to comment on shared documentation so that I can request corrections.
Acceptance Criteria
Space admin can enable or disable viewer comments.
Viewers can comment only when the setting is enabled.
Viewers cannot edit page content.
Functional Requirements
Enable viewer comments per space.
Disable viewer comments per space.
Allow viewer comment creation.
Prevent viewer editing.
Audit setting changes.
UX/UI Requirements
Space settings should clearly explain viewer comments.
Comment box should be available to viewers only when enabled.
Technical Notes
Comment permission must be checked independently from edit permission.
Test Cases
Viewer can comment when enabled.
Viewer cannot comment when disabled.
Viewer cannot edit even when comments are enabled.
7. Product Area: Search and Discovery
7.1 Epic: Full-Text Search
Feature 7.1.1: Workspace Search
Use Case

Users need to find relevant pages, people, files, and spaces quickly.

User Stories
As an employee, I want to search documentation so that I can find answers quickly.
As an engineer, I want to search code snippets and runbooks so that I can solve issues faster.
As an admin, I want search to respect permissions so that private information is protected.
Acceptance Criteria
Search returns pages matching title and content.
Search respects permissions.
Search results show snippets.
Users can filter results.
No inaccessible results are exposed.
Functional Requirements
Search page title.
Search page body.
Search comments.
Search attachments.
Search templates.
Filter by space.
Filter by author.
Filter by date.
Filter by status.
Filter by verification.
Highlight matches.
UX/UI Requirements
Search should be available globally.
Results should show title, space, snippet, and updated date.
Filters should be easy to use.
Empty states should suggest alternatives.
Technical Notes
Use PostgreSQL full-text search for core search.
Typesense can be used as an advanced driver.
Index updates should be queued after page changes.
Test Cases
Search by title.
Search by body text.
Search restricted content as authorized user.
Verify unauthorized user cannot see restricted result.
Filter by space.
Feature 7.1.2: Search Suggestions
Use Case

Users need quick access to likely pages before submitting a full search.

User Stories
As a user, I want suggestions while typing so that I can open pages faster.
As a new employee, I want suggested people and spaces so that I can discover the organization.
Acceptance Criteria
Suggestions appear while typing.
Suggestions include pages, spaces, users, and groups where appropriate.
Suggestions respect permissions.
Functional Requirements
Page suggestions.
Space suggestions.
User suggestions.
Group suggestions.
Recent searches.
Popular searches.
UX/UI Requirements
Suggestions should be fast.
Keyboard navigation should be supported.
Result types should be visually distinct.
Technical Notes
Use debounced search queries.
Cache frequent suggestions.
Test Cases
Type query and see suggestions.
Keyboard-select suggestion.
Restricted page does not appear.
7.2 Epic: AI Search and AI Answers
Feature 7.2.1: AI Answers with Citations
Use Case

Users ask a natural-language question and receive an answer grounded in accessible company knowledge.

User Stories
As an employee, I want to ask questions in natural language so that I do not need to know where information is stored.
As a manager, I want AI answers with citations so that I can trust the source.
As a security admin, I want AI search to respect permissions so that private content is not leaked.
Acceptance Criteria
User can ask a question.
AI returns a natural-language answer.
AI includes source citations.
AI only uses content the user can access.
If no reliable source exists, AI explains that it cannot answer confidently.
Functional Requirements
Question input.
Semantic retrieval.
Hybrid keyword/vector retrieval.
Source citation list.
Answer streaming.
Confidence indicator.
Follow-up question support.
Negative feedback button.
Positive feedback button.
UX/UI Requirements
AI answer should clearly separate answer and sources.
Sources should be clickable.
Low confidence should be visually clear.
User should be able to copy answer.
User should be able to open source page.
Technical Notes
Use embeddings for semantic retrieval.
Use permission-aware retrieval filters.
Use SSE for streaming.
Store feedback for evaluation.
Consider RAG evaluation and observability.
Test Cases
Ask question with known answer.
Verify citations point to relevant pages.
Ask question with no answer.
Verify restricted sources are excluded.
Submit negative feedback.
Feature 7.2.2: AI Search Trust Level
Use Case

Users need to know whether an AI answer is based on verified, recent, and reliable documentation.

User Stories
As a user, I want to know if an AI answer is trustworthy so that I can decide whether to rely on it.
As a knowledge manager, I want low-trust answers to reveal documentation gaps.
Acceptance Criteria
AI answers show trust level.
Trust level is calculated from source quality.
Low-trust answers recommend documentation improvement.
Functional Requirements

Trust calculation should consider:

Source verification status.
Source freshness.
Source owner exists or not.
Source relevance score.
Number of sources.
Conflicting sources.
UX/UI Requirements
Show trust badge: High, Medium, Low.
Explain why trust is low.
Link to improve source documentation.
Technical Notes
Trust score can be computed after retrieval using page metadata.
Store trust signals for analytics.
Test Cases
Verified recent page produces high trust.
Outdated unverified page produces low trust.
Conflicting sources produce warning.
8. Product Area: AI Assistant and AI Chat
8.1 Epic: AI Writing Assistant
Feature 8.1.1: AI Editor Actions
Use Case

Users need help writing, improving, translating, summarizing, and structuring documentation.

User Stories
As a writer, I want AI to improve my writing so that documentation is clearer.
As a non-native English speaker, I want translation and grammar correction so that I can publish professional content.
As a team lead, I want AI to turn bullet points into structured documentation so that we save time.
Acceptance Criteria
User can select text and open AI actions.
AI returns improved content.
User can accept, reject, or regenerate.
AI actions can be enabled/disabled by workspace settings.
Functional Requirements

Actions:

Improve writing.
Fix spelling and grammar.
Make shorter.
Make longer.
Simplify.
Change tone.
Summarize.
Explain.
Continue writing.
Translate.
Generate title.
Generate FAQ.
Generate checklist.
Convert notes to SOP.
Convert meeting notes to decisions.
UX/UI Requirements
AI menu should appear in editor context menu.
Generated output should be previewed before insertion.
Loading and streaming states should be clear.
User must remain in control.
Technical Notes
Use AI provider abstraction.
Support OpenAI-compatible endpoints, Mistral/OpenAI/Gemini/Ollama depending on configuration.
Stream generation where useful.
Apply rate limits.
Test Cases
Improve selected text.
Translate selected text.
Reject generated output.
Accept generated output.
Disable AI and verify actions are hidden/locked.
8.2 Epic: AI Chat
Feature 8.2.1: Workspace AI Chat
Use Case

Users need a conversational assistant that can answer questions, summarize content, and help create or update documentation.

User Stories
As an employee, I want to chat with workspace knowledge so that I can find answers quickly.
As an editor, I want AI to create a draft page so that I can document faster.
As an admin, I want AI tools to respect user permissions so that content remains secure.
Acceptance Criteria
Users can create chat sessions.
Chat supports multi-turn conversation.
Chat can cite pages.
Chat can use tools only within user permissions.
Chat history is saved.
Functional Requirements
Create chat.
List chats.
Rename chat.
Delete chat.
Send message.
Stream response.
Mention pages with @.
Upload file to chat.
Search pages.
Read page.
Create page.
Update page.
List spaces.
Search attachments.
UX/UI Requirements
Chat can open as sidebar or full-page view.
Page mentions should autocomplete.
Tool actions should be transparent to user.
Destructive AI actions should require confirmation.
Technical Notes
Use SSE for streaming.
Store chat messages in database.
Use tool calling with permission checks.
Use AbortController for cancellation.
Test Cases
Create chat and send message.
Mention page and ask summary.
AI creates draft page with confirmation.
User without edit permission cannot use AI update-page tool.
Delete chat removes it from list.
Feature 8.2.2: AI Documentation Generator
Use Case

A team wants to generate a complete documentation structure from a short project description.

User Stories
As a product manager, I want to generate product documentation so that I can start faster.
As an engineer, I want to generate technical documentation so that architecture and APIs are documented consistently.
As a consultant, I want to generate client documentation spaces so that delivery is standardized.
Acceptance Criteria
User provides a documentation brief.
AI suggests a page structure.
User can review and approve before creation.
AI creates pages using templates.
Functional Requirements

Input fields:

Product/project name.
Description.
Target users.
Features.
Technical stack.
Integrations.
Security needs.
Documentation type.

Generated outputs:

Product overview.
User guide.
Admin guide.
Technical architecture.
API documentation.
Database documentation.
Deployment guide.
Security guide.
FAQ.
Release notes.
UX/UI Requirements
Wizard-based flow.
Preview generated tree before creation.
Allow user to remove or rename proposed pages.
Show estimated number of pages.
Technical Notes
Generated pages should be drafts by default.
Use templates for consistency.
Large generation should run as background job.
Test Cases
Generate documentation tree from brief.
Remove proposed page before creation.
Create draft pages.
Verify generated pages are linked in tree.
9. Product Area: Human-in-the-Loop Knowledge
9.1 Epic: Expert Insights
Feature 9.1.1: Expert Insight on AI Answers
Use Case

AI answers may be incomplete or need operational context from human experts.

User Stories
As an expert, I want to add a correction to an AI answer so that others receive more accurate information.
As a user, I want to see expert notes so that I can understand real-world exceptions.
As a knowledge manager, I want expert insights to improve documentation quality over time.
Acceptance Criteria
Experts can add insights to AI answers.
Insights show author, role, date, and verification status.
Users can see expert insights below AI answers.
Insights can be converted into page updates.
Functional Requirements
Add insight.
Edit insight.
Delete insight.
Mark insight verified.
Add insight type: correction, warning, best practice, workaround, example.
Attach files/images.
Link insight to source page.
Convert insight into comment or page update.
UX/UI Requirements
Insights should be visually distinct from AI output.
Show expert profile and role.
Allow voting: helpful/not helpful.
Highlight verified insights.
Technical Notes
Store insights separately from AI messages.
Link insight to AI answer, source page, and workspace.
Insights should be searchable.
Test Cases
Expert adds correction.
User sees insight below answer.
Insight is marked verified.
Non-expert cannot verify insight.
Insight can be linked to page update.
9.2 Epic: Knowledge Gap Detection
Feature 9.2.1: AI Knowledge Gap Detection
Use Case

Organizations need to know what knowledge is missing, outdated, duplicated, or weak.

User Stories
As a knowledge manager, I want to detect missing documentation so that I can improve coverage.
As an admin, I want to see failed searches so that I know what users cannot find.
As a team lead, I want suggested pages so that my team can document important processes.
Acceptance Criteria
System identifies knowledge gaps from search, AI feedback, comments, and page metadata.
Gaps are grouped by priority.
Users can create pages from suggested gaps.
Functional Requirements

Detect:

Failed searches.
AI low-confidence answers.
Outdated pages.
Duplicate pages.
Contradictory pages.
Pages without owners.
Pages without verification.
Repeated unanswered questions.
Critical spaces with weak documentation.

Actions:

Create page from gap.
Assign owner.
Assign reviewer.
Ignore gap.
Merge duplicate pages.
Archive obsolete pages.
UX/UI Requirements
Gap dashboard with severity levels.
Show evidence for each gap.
Provide one-click action suggestions.
Allow filtering by space, owner, severity, and type.
Technical Notes
Use background jobs for periodic analysis.
Combine signals from search logs, AI feedback, comments, and page metadata.
Use embeddings for duplicate/contradiction detection.
Test Cases
Failed search creates potential gap.
Old page is flagged as outdated.
Duplicate content is detected.
User creates page from gap suggestion.
Ignored gap does not reappear immediately.
10. Product Area: Templates and Standards
10.1 Epic: Templates
Feature 10.1.1: Page Templates
Use Case

Teams need consistent documentation formats for repeated document types.

User Stories
As a knowledge manager, I want templates so that documentation follows standards.
As an employee, I want to create a page from a template so that I do not start from zero.
As an admin, I want to control who can create templates so that quality remains high.
Acceptance Criteria
Users with permission can create templates.
Users can create pages from templates.
Templates can be workspace-wide or space-specific.
Templates are searchable.
Functional Requirements
Create template.
Edit template.
Delete template.
Preview template.
Use template.
Categorize template.
Set template scope: workspace or space.
Restrict template creation.
Search templates.

Template examples:

PRD.
Technical specification.
ADR.
API documentation.
Runbook.
Incident report.
Postmortem.
Meeting notes.
Onboarding guide.
Security policy.
HR policy.
Release notes.
UX/UI Requirements
Template gallery should be easy to browse.
Templates should have categories and descriptions.
Page creation flow should suggest relevant templates.
Technical Notes
Template content can use ProseMirror JSON and Yjs state.
Templates should be indexed for search.
Test Cases
Create workspace template.
Create space template.
Use template to create page.
Search template by title.
Unauthorized user cannot create template.
11. Product Area: Review, Verification and Governance
11.1 Epic: Page Verification
Feature 11.1.1: Expiring Verification
Use Case

Critical documentation must be reviewed periodically to remain trusted.

User Stories
As a knowledge owner, I want to verify a page so that users know it is accurate.
As a compliance manager, I want verification to expire so that critical knowledge is reviewed regularly.
As a user, I want to see if a page is expired so that I do not rely on outdated information.
Acceptance Criteria
Authorized users can verify a page.
Verification can have an expiration period.
Page status changes when verification expires.
Notifications are sent before and after expiration.
Functional Requirements
Enable verification.
Set verification type.
Set expiration mode.
Set expiration period.
Assign verifier.
Mark page verified.
Mark page expired.
Notify before expiration.
Notify after expiration.
UX/UI Requirements
Verification badge visible near page title.
Expired pages show warning banner.
Verification settings available in page menu.
Users can view verification history.
Technical Notes
Scheduled jobs should detect expiring and expired pages.
Verification events should be audited.
Verification status should affect AI trust level.
Test Cases
Verify page for 30 days.
Page shows verified badge.
Expired page shows warning.
Notification sent before expiry.
Unauthorized user cannot verify.
Feature 11.1.2: QMS Approval Workflow
Use Case

Regulated teams need formal approval before documentation becomes official.

User Stories
As an author, I want to submit a page for approval so that it can become official.
As a verifier, I want to approve or reject a page so that quality is controlled.
As a compliance owner, I want rejection comments so that authors know what to fix.
Acceptance Criteria
Author can submit page for approval.
Assigned verifier can approve or reject.
Rejection requires a comment.
Approved page becomes verified.
Workflow events are audited.
Functional Requirements
Configure QMS workflow.
Assign verifiers.
Submit for approval.
Approve page.
Reject page.
Add rejection reason.
Mark obsolete.
View approval history.
UX/UI Requirements
Workflow status should be visible on page.
Approvers should have clear approve/reject actions.
Rejection reason should be visible to author.
Pending approval should lock or warn on edits, depending on policy.
Technical Notes
Approval workflow should be state-machine based.
Page edits after approval may reset status to draft or require reapproval.
Test Cases
Submit page for approval.
Approver approves page.
Approver rejects with reason.
Page becomes verified after approval.
Non-approver cannot approve.

# ConqrAI Wiki — Product Area 12: Permissions and Access Control

## 12. Product Area: Permissions and Access Control

## 12.1 Product Area Overview

Permissions and Access Control define who can access, create, edit, comment, manage, share, export, approve, and administer content inside ConqrAI Wiki.

This product area is critical because ConqrAI Wiki is designed for enterprise and self-managed environments where documentation may include sensitive knowledge such as HR policies, technical architecture, production runbooks, customer projects, security procedures, financial processes, legal documents, AI prompts, and internal strategy.

The access control system must be flexible enough for normal collaborative documentation and strict enough for enterprise governance, compliance, and security.

## 12.2 Product Vision for Permissions

The permission system should help organizations answer these questions:

* Who can see this knowledge?
* Who can edit this knowledge?
* Who owns this knowledge?
* Who can approve this knowledge?
* Who can share this knowledge externally?
* Who can export this knowledge?
* Why does this user have access?
* What changed in the access model, when, and by whom?

The system should be simple for normal users, powerful for admins, and secure by default.

## 12.3 Permission Design Principles

### Principle 1: Secure by Default

Private and restricted content must never be exposed through pages, search, AI answers, public links, exports, comments, notifications, or API access.

### Principle 2: Server-Side Authorization First

Frontend checks improve user experience, but every sensitive operation must be validated on the backend.

### Principle 3: Clear Inheritance

Permissions should be easy to understand across workspace, space, page, and child page levels.

### Principle 4: Explainable Access

Admins and users should understand why someone has access: direct user permission, group permission, space role, inherited page restriction, workspace role, or public link.

### Principle 5: Least Privilege

Users should receive the minimum access needed to complete their work.

### Principle 6: Audit Everything Sensitive

All permission changes, role changes, public sharing changes, and security changes must be audit logged.

### Principle 7: Permission-Aware AI

AI Search, AI Chat, MCP, and AI tools must only access content that the current user or API key is allowed to access.

---

# 12.4 Access Control Layers

ConqrAI Wiki should use layered permissions.

```text
Workspace Role
   ↓
Space Permission
   ↓
Page-Level Permission / Restriction
   ↓
Feature-Specific Permission
   ↓
Temporary or Public Access Rule
```

## 12.4.1 Workspace Role Layer

Workspace roles define broad administrative authority.

Examples:

* Owner
* Admin
* Knowledge Manager
* Member
* Guest

## 12.4.2 Space Permission Layer

Space permissions define access to a documentation area.

Examples:

* Space Admin
* Writer
* Commenter
* Reader
* No Access

## 12.4.3 Page-Level Permission Layer

Page permissions restrict or override access for specific pages.

Examples:

* Page Reader
* Page Writer
* Page Manager
* Restricted page
* Inherited restriction from parent page

## 12.4.4 Feature-Specific Permission Layer

Feature permissions control advanced actions.

Examples:

* Can create public links
* Can export pages
* Can use AI
* Can manage templates
* Can approve pages
* Can view audit logs
* Can create API keys

## 12.4.5 Public and External Access Layer

Public links and guest access allow controlled external sharing.

Examples:

* Public page link
* Password-protected link
* Expiring link
* External guest user
* Client workspace access

---

# 12.5 Epic: Workspace Roles

## 12.5.1 Feature: Workspace Role Management

### Use Case

A company needs to assign different levels of authority to users depending on their responsibilities. An owner manages billing and global settings. Admins manage users and security. Knowledge managers govern documentation quality. Members create and consume documentation. Guests access limited content.

### User Stories

* As an owner, I want to assign workspace roles so that each user has the correct level of authority.
* As an admin, I want to promote or demote members so that responsibilities can change over time.
* As a security owner, I want role changes to be audited so that access changes are traceable.
* As a user, I want to see my role so that I understand my permissions.

### Acceptance Criteria

* Owners can assign and change workspace roles.
* Admins can manage users according to allowed policy.
* Only owners can transfer ownership or manage billing-critical permissions.
* Role changes are immediately applied.
* Role changes are recorded in audit logs.
* Users cannot escalate their own privileges.
* At least one owner must always remain in the workspace.

### Functional Requirements

#### Supported Workspace Roles

| Role              | Description                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Owner             | Full control over workspace, billing/license, security, audit logs, and ownership transfer.               |
| Admin             | Manages users, groups, spaces, workspace settings, and security configuration, except owner-only actions. |
| Knowledge Manager | Manages templates, documentation health, verification workflows, and content governance.                  |
| Member            | Standard internal user who can access spaces based on assigned permissions.                               |
| Guest             | External or limited user with access only to explicitly assigned spaces/pages.                            |

#### Role Management Functions

* Invite user with role.
* Change user role.
* Remove user from workspace.
* Deactivate user.
* Reactivate user.
* Transfer ownership.
* Prevent last owner removal.
* View role history.
* Audit role changes.

### UX/UI Requirements

* Workspace members table should show user name, email, role, groups, status, last active date, and MFA status.
* Role dropdown should explain each role before selection.
* Owner-level actions should display stronger confirmation dialogs.
* The UI should prevent removing the last owner.
* Role changes should show a success notification.
* Users should see locked options when their role does not allow an action.

### Technical Notes

* Workspace roles should be stored on workspace membership records.
* Server authorization must check actor role and target role.
* Ownership transfer should be transactional.
* Role changes should emit audit events.
* CASL rules can map roles to allowed actions.

### Test Cases

* Owner promotes member to admin.
* Admin cannot remove owner if policy forbids it.
* User cannot change own role to admin.
* Last owner cannot be removed.
* Role change is reflected immediately.
* Role change creates audit event.

---

# 12.6 Epic: Groups and Team-Based Access

## 12.6.1 Feature: Groups

### Use Case

Large organizations do not want to manage permissions user by user. They need groups such as Engineering, Product, HR, DevOps, Security, Leadership, and Customer Success to manage access at scale.

### User Stories

* As an admin, I want to create groups so that I can manage permissions for teams.
* As a space admin, I want to give a group access to a space so that the whole team can collaborate.
* As an IT admin, I want groups to sync from SSO or SCIM so that access follows company structure.

### Acceptance Criteria

* Admins can create, update, and delete groups.
* Admins can add and remove users from groups.
* Groups can be assigned to spaces and pages.
* Group-based permissions are applied to all group members.
* Group membership changes update access immediately.
* Group changes are audit logged.

### Functional Requirements

* Create group.
* Rename group.
* Delete group.
* Add user to group.
* Remove user from group.
* List group members.
* Assign group to space.
* Assign group to page.
* Assign group role: reader, commenter, writer, admin, manager depending on context.
* Sync groups from SSO/SCIM, advanced.
* Show inherited access from groups.

### UX/UI Requirements

* Groups page should show group name, description, member count, linked spaces, and linked pages.
* Group detail page should show members and permissions.
* User profile should show group memberships.
* Permission modals should allow searching users and groups from the same input.
* Group permissions should be visually different from direct user permissions.

### Technical Notes

* Group permissions should be resolved in authorization services.
* Avoid expensive permission checks by caching group membership carefully.
* Permission checks must still be correct after group membership changes.
* SCIM-synced groups may need read-only management in the app.

### Test Cases

* Create group and add users.
* Assign group as space writer.
* Group member can edit pages in that space.
* Remove user from group and verify access is removed.
* Delete group and verify permissions are removed.
* Group permission appears in access explanation.

---

# 12.7 Epic: Space-Level Permissions

## 12.7.1 Feature: Space Roles

### Use Case

Each documentation space may require different access rules. Engineering may be editable by engineers, HR policies may be readable by everyone but editable only by HR, and leadership strategy may be private.

### User Stories

* As a space admin, I want to define who can read, comment, edit, and manage a space.
* As an admin, I want to grant access to groups instead of individual users.
* As a member, I want to know whether I can edit a page before I start making changes.

### Acceptance Criteria

* Space admins can add users and groups to a space.
* Space roles control available actions.
* Space roles are inherited by pages unless page-level restrictions apply.
* Users without space access cannot see the space or its pages.
* Space permission changes are audit logged.

### Functional Requirements

#### Supported Space Roles

| Role        | Can View | Can Comment | Can Edit | Can Manage Space |
| ----------- | -------: | ----------: | -------: | ---------------: |
| Space Admin |      Yes |         Yes |      Yes |              Yes |
| Writer      |      Yes |         Yes |      Yes |               No |
| Commenter   |      Yes |         Yes |       No |               No |
| Reader      |      Yes |    Optional |       No |               No |
| No Access   |       No |          No |       No |               No |

#### Space Permission Functions

* Add user to space.
* Remove user from space.
* Change user role.
* Add group to space.
* Remove group from space.
* Change group role.
* Set default workspace-member access for the space.
* Make space private.
* Make space visible to all members.
* Disable viewer comments.
* Enable viewer comments.
* Disable public sharing for the space.

### UX/UI Requirements

* Space settings should include a Members & Permissions tab.
* Users and groups should be listed with their roles.
* Role changes should be inline and quick.
* The UI should warn before removing a space admin if no other admin remains.
* Permission explanations should be available: “Yahya has Writer access through Engineering group.”

### Technical Notes

* Space permissions are the default access model for pages.
* Page-level restrictions can further restrict access.
* Space membership should be indexed for efficient permission checks.
* Search queries must filter by accessible spaces and restricted pages.

### Test Cases

* Reader can view page but cannot edit.
* Writer can edit page.
* Commenter can comment but cannot edit.
* Space admin can manage space members.
* User without access cannot see space.
* Group-based writer access works.

---

# 12.8 Epic: Page-Level Permissions

## 12.8.1 Feature: Page Restriction

### Use Case

A page inside an otherwise accessible space may contain sensitive information. For example, a Product space is visible to all employees, but the roadmap page should only be accessible to leadership and product managers.

### User Stories

* As a page owner, I want to restrict a page so that only selected users and groups can access it.
* As a space admin, I want child pages to inherit parent restrictions so that sensitive sections stay protected.
* As a user, I want to understand why a page is restricted so that I know who to contact for access.

### Acceptance Criteria

* Authorized users can restrict a page.
* Restricted pages only allow explicitly permitted users/groups and authorized admins.
* Child pages inherit restrictions from parent pages.
* Users without access cannot view the page, search it, receive AI answers from it, export it, or access it through API.
* Restriction changes are audit logged.

### Functional Requirements

* Enable page restriction.
* Disable page restriction.
* Add user as reader.
* Add user as writer.
* Add group as reader.
* Add group as writer.
* Remove user/group permission.
* Change permission role.
* Detect inherited restriction.
* Show restriction source.
* Allow breaking inheritance, optional advanced.
* Allow requesting access, optional.

### UX/UI Requirements

* Page menu should include “Manage access” or “Restrict page.”
* Access modal should show direct access, inherited access, and space access.
* Inherited restriction should show source parent page.
* Restricted pages should show a lock icon.
* Users without access should see a safe access-denied page without leaking sensitive page content.

### Technical Notes

* Page permission checks must be applied in page read, page update, comments, search, export, AI retrieval, MCP tools, and API endpoints.
* Permission inheritance can be resolved recursively or through precomputed access paths.
* Audit events should include page ID, actor ID, target user/group, role, and old/new state.

### Test Cases

* Restrict page to a single user.
* Authorized user can view restricted page.
* Unauthorized user cannot view restricted page.
* Unauthorized user cannot find restricted page in search.
* Unauthorized user cannot get AI answer using restricted page.
* Child page inherits parent restriction.
* Removing restriction restores space-level access.

---

## 12.8.2 Feature: Page Access Explanation

### Use Case

Admins and users need to understand why a person has access to a specific page, especially when access can come from workspace role, space role, group membership, direct page permission, or inherited restriction.

### User Stories

* As an admin, I want to see why a user has access so that I can audit permissions.
* As a user, I want to understand why I can or cannot access a page.
* As a security owner, I want to detect accidental access from broad groups.

### Acceptance Criteria

* Access explanation shows all access sources.
* Explanation includes direct and inherited permissions.
* Admins can inspect access for any user.
* Normal users can see a limited explanation for their own access.

### Functional Requirements

Access explanation should show:

* Workspace role.
* Space role.
* Direct page permission.
* Group-based page permission.
* Parent page inherited restriction.
* Public link access, if applicable.
* Whether access is blocked by restriction.
* Final resolved permission: no access, view, comment, edit, manage.

### UX/UI Requirements

* Use a clear “Why does this user have access?” action.
* Show access as a readable chain.
* Example: “Access granted because user belongs to Engineering group, which has Writer role in this space.”
* For denied access, show safe message without exposing sensitive group or page names to unauthorized users.

### Technical Notes

* Implement a permission resolution service that can return both boolean permissions and explanation metadata.
* Explanation responses should be carefully permission-controlled.

### Test Cases

* User access explained through space role.
* User access explained through group role.
* User access denied due to page restriction.
* Inherited restriction explanation points to parent page.

---

# 12.9 Epic: Content Action Permissions

## 12.9.1 Feature: Page Action Permissions

### Use Case

Different users may have different rights on the same page. A reader can view. A commenter can comment. A writer can edit. A manager can restrict, move, delete, verify, or share.

### User Stories

* As a reader, I want to view content without accidentally editing it.
* As a writer, I want to edit and organize pages.
* As a space admin, I want to delete or move pages when restructuring documentation.
* As a knowledge owner, I want only authorized users to verify critical pages.

### Acceptance Criteria

* Each page action checks the current user’s permission.
* Unauthorized actions are hidden or disabled in UI.
* Backend rejects unauthorized actions.
* Sensitive action failures do not leak private data.

### Functional Requirements

Actions requiring permission:

* View page.
* Create page.
* Edit page.
* Rename page.
* Move page.
* Copy page.
* Duplicate page.
* Delete page.
* Restore page.
* Permanently delete page.
* Comment on page.
* Resolve comment.
* Manage page access.
* Create public share.
* Export page.
* Verify page.
* Submit for approval.
* Approve page.
* Reject page.
* Mark page obsolete.
* Use AI on page.

### UX/UI Requirements

* Hide actions users cannot perform where possible.
* For visible locked actions, show helpful explanation or upgrade/access message.
* Destructive actions require confirmation.
* Approval and verification actions should be visually separate from normal edit actions.

### Technical Notes

* Define page action constants.
* Use centralized policy checks rather than scattered logic.
* API endpoints should return 403 for unauthorized actions.

### Test Cases

* Reader cannot edit.
* Commenter can comment but not edit.
* Writer can edit but cannot manage access unless allowed.
* Space admin can move/delete page.
* Unauthorized export is blocked.
* Unauthorized verification is blocked.

---

# 12.10 Epic: Feature-Specific Access Control

## 12.10.1 Feature: AI Permission Control

### Use Case

Organizations may want to enable AI only for certain users, spaces, or content types due to privacy, cost, or compliance.

### User Stories

* As an admin, I want to control who can use AI so that usage is governed.
* As a security owner, I want AI to ignore restricted pages unless the user has access.
* As a finance owner, I want AI usage limited by role so that costs are controlled.

### Acceptance Criteria

* Admin can enable or disable AI at workspace level.
* AI can optionally be disabled per space.
* AI retrieval respects user permissions.
* AI tools cannot perform actions the user cannot perform directly.
* AI usage is logged.

### Functional Requirements

* Enable/disable AI Assistant.
* Enable/disable AI Search.
* Enable/disable AI Chat.
* Enable/disable MCP.
* Limit AI by role.
* Limit AI by space.
* Prevent AI indexing of selected spaces, optional.
* Apply user permissions during retrieval.
* Apply action permissions during tool calls.

### UX/UI Requirements

* AI settings should explain privacy and permission behavior.
* When AI is disabled, users should see a clear locked state.
* AI answers should never show inaccessible sources.

### Technical Notes

* Retrieval layer must filter by accessible document IDs.
* AI tools should call the same service-layer permission checks as normal UI actions.
* AI logs should include actor, feature, model, token usage, and source count.

### Test Cases

* AI disabled hides AI actions.
* AI Search excludes restricted page.
* AI Chat cannot update page without edit permission.
* MCP cannot access private content without API key permission.

---

## 12.10.2 Feature: Export Permission Control

### Use Case

Exporting documentation can create data leakage risk. Organizations need to control who can export pages and spaces.

### User Stories

* As an admin, I want to restrict exports so that sensitive knowledge cannot be downloaded by everyone.
* As a user, I want to export pages I am allowed to share.
* As a compliance owner, I want export events audited.

### Acceptance Criteria

* Export requires permission.
* Export includes only accessible content.
* Export activity is audited.
* Admin can disable exports for selected roles or spaces.

### Functional Requirements

* Export page permission.
* Export space permission.
* Export with children permission.
* Include attachment permission.
* Restrict export by role.
* Audit export events.
* Optional: watermark exported PDFs.

### UX/UI Requirements

* Export option hidden or disabled if unavailable.
* Export modal explains included content.
* Long exports show job status.

### Technical Notes

* Export service must re-check access for every page included.
* Background export jobs must run with the requesting user context.

### Test Cases

* User exports accessible page.
* User cannot export restricted page.
* Space export excludes inaccessible child pages.
* Export event appears in audit logs.

---

## 12.10.3 Feature: Template Permission Control

### Use Case

Templates influence documentation quality. Organizations may want only admins or knowledge managers to create official templates.

### User Stories

* As a knowledge manager, I want to create official templates so that documentation stays consistent.
* As an admin, I want to restrict template creation so that users do not create low-quality standards.
* As a user, I want to use approved templates so that I can write faster.

### Acceptance Criteria

* Template creation can be restricted.
* Users can use templates they are allowed to access.
* Space templates are visible only in relevant spaces.
* Template changes are audited.

### Functional Requirements

* Create workspace template permission.
* Create space template permission.
* Edit template permission.
* Delete template permission.
* Use template permission.
* Restrict template creation to admins/knowledge managers.

### UX/UI Requirements

* Template gallery should show only accessible templates.
* Locked template management actions should be hidden.

### Technical Notes

* Template permissions should align with workspace and space roles.

### Test Cases

* Knowledge manager creates template.
* Member cannot create template if restricted.
* User can use space template in allowed space.

---

# 12.11 Epic: Public Sharing Permissions

## 12.11.1 Feature: Public Sharing Control

### Use Case

Teams may need to share selected documentation externally, but organizations must control who can create public links and which spaces allow sharing.

### User Stories

* As an editor, I want to share a page publicly so that external users can read it.
* As an admin, I want to disable public sharing workspace-wide so that sensitive content is protected.
* As a space admin, I want to disable public sharing for one space so that private documentation cannot be exposed.

### Acceptance Criteria

* Only authorized users can create public links.
* Public sharing can be disabled globally.
* Public sharing can be disabled per space.
* Existing links are revoked or blocked when sharing is disabled.
* Public sharing events are audited.

### Functional Requirements

* Create public link.
* Revoke public link.
* Regenerate public link.
* Disable workspace public sharing.
* Disable space public sharing.
* Remove branding in public pages, plan-gated.
* Set expiration date, advanced.
* Password protection, advanced.
* Public view analytics, advanced.

### UX/UI Requirements

* Share modal should show whether public sharing is allowed.
* If blocked by workspace or space setting, explain why.
* Disabling sharing should show warning about existing links.
* Public pages should not expose internal navigation or private metadata.

### Technical Notes

* Public links should use unguessable IDs/tokens.
* Public share resolver should check workspace and space sharing settings on every request.
* Public access must not use normal authenticated workspace session assumptions.

### Test Cases

* Writer creates public link when allowed.
* Reader cannot create public link.
* Disable public sharing blocks existing link.
* Public page does not show private comments if not allowed.
* Public sharing event is audited.

---

# 12.12 Epic: Guest and External Access

## 12.12.1 Feature: Guest Users

### Use Case

Organizations need to collaborate with clients, vendors, auditors, or partners without giving them full workspace access.

### User Stories

* As an admin, I want to invite a guest to a specific space so that they can access only relevant documentation.
* As a client, I want to read project documentation without seeing internal company pages.
* As a security owner, I want guest access to be clearly limited and auditable.

### Acceptance Criteria

* Guests only access assigned spaces/pages.
* Guests cannot browse workspace-wide internal content.
* Guest permissions are clearly marked.
* Guest actions are audited.

### Functional Requirements

* Invite guest.
* Assign guest to space.
* Assign guest to page.
* Set guest role: reader/commenter/writer if allowed.
* Expire guest access.
* Remove guest access.
* Show guest badge.
* Audit guest actions.

### UX/UI Requirements

* Guest users should be visually labeled.
* Invitation flow should warn admins about external access.
* Guest access overview should show all external users and what they can access.

### Technical Notes

* Guest accounts may require separate role type.
* Guest access should be denied by default to workspace-wide discovery features unless explicitly allowed.
* AI access for guests should be disabled or tightly scoped by default.

### Test Cases

* Guest can access assigned page.
* Guest cannot see unrelated spaces.
* Guest cannot use workspace-wide search unless allowed.
* Guest access expires.
* Guest removal revokes access.

---

# 12.13 Epic: Access Requests

## 12.13.1 Feature: Request Access

### Use Case

A user may encounter a restricted page they need for work. Instead of contacting admins manually, they can request access directly.

### User Stories

* As a user, I want to request access to a restricted page so that I can continue my work.
* As a page owner, I want to approve or deny requests so that access stays controlled.
* As an admin, I want access requests tracked so that decisions are auditable.

### Acceptance Criteria

* Users without access can request access if the page existence can be safely revealed.
* Page owner or space admin receives request.
* Approver can approve or reject.
* Decision is audit logged.

### Functional Requirements

* Request access.
* Add request reason.
* Notify page owner/admin.
* Approve request.
* Reject request.
* Add rejection reason.
* View pending requests.
* Auto-expire old requests.

### UX/UI Requirements

* Access denied page should include request button when safe.
* Request form should ask for reason.
* Approver UI should show requester, page, reason, and recommended role.

### Technical Notes

* In highly sensitive settings, page existence should not be revealed; request access may be disabled.
* Approval should create page or space permission depending on approver choice.

### Test Cases

* User requests access.
* Owner receives notification.
* Owner approves reader access.
* User gains access.
* Owner rejects with reason.

---

# 12.14 Epic: API and Automation Permissions

## 12.14.1 Feature: API Key Access Control

### Use Case

Developers and automation systems need API access, but API keys must not bypass security.

### User Stories

* As a developer, I want API keys to inherit my permissions so that automation can work safely.
* As an admin, I want workspace-level API keys so that service integrations are not tied to a single user.
* As a security owner, I want API key use audited so that integrations are traceable.

### Acceptance Criteria

* API keys authenticate requests.
* API keys have defined scope or actor context.
* API keys cannot access resources outside their permission scope.
* API key creation and use are audited.

### Functional Requirements

* Personal API keys.
* Workspace API keys.
* Key scopes, advanced.
* Expiration date.
* Revoke key.
* Last-used tracking.
* Restrict API key creation.
* Audit API access, at least sensitive actions.

### UX/UI Requirements

* API key UI should show name, creator, expiration, last used, and status.
* Token should be shown once.
* Scope selection should be clear if implemented.

### Technical Notes

* Store only hashed tokens.
* API key identity should map to user or service actor.
* Authorization checks must work for API key actors.

### Test Cases

* API key can read allowed page.
* API key cannot read restricted page.
* Revoked API key fails.
* Expired API key fails.
* API key action appears in audit logs.

---

## 12.14.2 Feature: MCP Tool Permissions

### Use Case

External AI clients connected through MCP need access to wiki tools, but they must obey the same access rules as users.

### User Stories

* As an admin, I want MCP tools to use API key permissions so that AI clients do not bypass access controls.
* As a user, I want external AI tools to search only what I can access.
* As a security owner, I want MCP write actions to be restricted.

### Acceptance Criteria

* MCP requires authentication.
* MCP tools check permissions.
* MCP write operations require explicit allowed permissions.
* MCP actions are audit logged.

### Functional Requirements

Permission checks for MCP tools:

* search_pages.
* get_page.
* create_page.
* update_page.
* list_pages.
* list_spaces.
* search_attachments.
* get_comments.
* create_comment.
* list_workspace_members.

### UX/UI Requirements

* MCP settings should explain that external clients can access wiki data.
* Admins should be able to disable MCP.
* Setup instructions should recommend least-privilege API keys.

### Technical Notes

* MCP should call internal service methods rather than direct database access.
* Tool calls should include actor context.

### Test Cases

* MCP search excludes restricted pages.
* MCP update page fails without edit permission.
* MCP create comment works with comment permission.
* MCP disabled blocks all tool calls.

---

# 12.15 Epic: Permission-Aware Search, AI, Export and Notifications

## 12.15.1 Feature: Permission-Aware Search

### Use Case

Search must never reveal inaccessible page titles, snippets, attachments, comments, or metadata.

### User Stories

* As a user, I want search results to include only content I can access.
* As a security owner, I want restricted content hidden from search.

### Acceptance Criteria

* Search results are filtered by user permissions.
* Restricted page titles and snippets are not leaked.
* Attachment results follow parent page permissions.

### Functional Requirements

* Filter pages by accessible spaces.
* Filter pages by page restrictions.
* Filter attachments by parent access.
* Filter comments by page access.
* Apply same logic to suggestions.

### UX/UI Requirements

* If no results are available due to lack of access, show normal no-results state.
* Do not reveal that restricted content exists.

### Technical Notes

* Search index may include all content, but query result filtering is mandatory.
* For high security, index partitioning by workspace and access group can be considered.

### Test Cases

* Restricted page does not appear in search.
* Attachment from restricted page does not appear.
* Suggestion does not leak restricted title.

---

## 12.15.2 Feature: Permission-Aware Notifications

### Use Case

Notifications should not expose content to users who no longer have access.

### User Stories

* As a user, I want notifications for pages I can access.
* As a security owner, I want notification content to be safe if permissions change.

### Acceptance Criteria

* Notifications are sent only to authorized recipients.
* Notification previews do not expose restricted content after access is removed.
* Opening notification re-checks access.

### Functional Requirements

* Check access before sending notification.
* Re-check access when opening notification.
* Hide sensitive preview if access is uncertain.
* Remove or neutralize notifications after permission removal, optional.

### UX/UI Requirements

* If access is removed, notification click should show access denied.
* Notification text should avoid excessive sensitive details for restricted pages.

### Technical Notes

* Notification jobs should include resource ID, not full content when possible.
* Access should be checked at delivery and read time.

### Test Cases

* User receives mention notification for accessible page.
* User loses access before opening notification.
* Opening notification shows access denied.
* Restricted page title is not leaked to unauthorized user.

---

# 12.16 Epic: Audit and Compliance for Permissions

## 12.16.1 Feature: Permission Audit Events

### Use Case

Enterprise customers need to prove who changed access, when, and why.

### User Stories

* As a compliance owner, I want permission changes audited so that we have traceability.
* As an admin, I want to investigate accidental exposure so that I can fix it quickly.
* As a security owner, I want to see public sharing changes so that I can monitor risk.

### Acceptance Criteria

* All sensitive access changes create audit events.
* Audit events include actor, target, resource, timestamp, and metadata.
* Audit logs can be filtered by permission event type.

### Functional Requirements

Audit events:

* Workspace role changed.
* User invited.
* User removed.
* User deactivated.
* Group created.
* Group deleted.
* Group member added.
* Group member removed.
* Space member added.
* Space member removed.
* Space role changed.
* Page restricted.
* Page unrestricted.
* Page permission added.
* Page permission removed.
* Public share created.
* Public share deleted.
* API key created.
* API key revoked.
* SSO enforced.
* MFA enforced.
* SCIM token created.

### UX/UI Requirements

* Audit log page should provide filters for access and security events.
* Event details should show before/after values where useful.
* Use readable labels instead of internal event names.

### Technical Notes

* Use asynchronous audit queue for reliability.
* Audit events should be immutable.
* Retention settings apply to audit logs unless legal hold is implemented.

### Test Cases

* Page restriction creates audit event.
* Role change creates before/after audit event.
* Public share creation is logged.
* Audit filter by event type works.

---

# 12.17 Epic: Permission Administration UX

## 12.17.1 Feature: Central Access Management Console

### Use Case

Admins need a central place to review users, groups, spaces, public links, guests, and risky permissions.

### User Stories

* As an admin, I want to see all public links so that I can remove risky shares.
* As a security owner, I want to see guests and their access so that external exposure is controlled.
* As a knowledge manager, I want to see pages with broken ownership so that governance improves.

### Acceptance Criteria

* Admins can view access overview dashboards.
* Admins can filter risky access.
* Admins can revoke access from central console.

### Functional Requirements

Access console sections:

* Users.
* Groups.
* Guests.
* Space permissions.
* Page restrictions.
* Public links.
* API keys.
* Pending access requests.
* Risky access findings.

Risk indicators:

* Public links in sensitive spaces.
* Guests with writer access.
* Pages without owner.
* API keys not used recently.
* Admin users without MFA.
* Broad group access to restricted content.

### UX/UI Requirements

* Use dashboard cards for risk summary.
* Provide tables with filters and bulk actions.
* Provide direct links to fix permissions.
* Show risk severity.

### Technical Notes

* Risk findings can be computed with scheduled jobs.
* Central console requires strong admin-only access.

### Test Cases

* Admin sees public links list.
* Admin revokes public link from console.
* Guest access appears in guest section.
* Non-admin cannot access console.

---

# 12.18 Permission Matrix

## 12.18.1 Workspace-Level Matrix

| Action                    | Owner |    Admin | Knowledge Manager |   Member | Guest |
| ------------------------- | ----: | -------: | ----------------: | -------: | ----: |
| Manage billing/license    |   Yes | Optional |                No |       No |    No |
| Manage workspace settings |   Yes |      Yes |           Limited |       No |    No |
| Manage users              |   Yes |      Yes |                No |       No |    No |
| Manage groups             |   Yes |      Yes |          Optional |       No |    No |
| Manage SSO/MFA            |   Yes |      Yes |                No |       No |    No |
| View audit logs           |   Yes | Optional |                No |       No |    No |
| Manage templates          |   Yes |      Yes |               Yes | Optional |    No |
| View documentation health |   Yes |      Yes |               Yes |  Limited |    No |
| Create spaces             |   Yes |      Yes |          Optional | Optional |    No |

## 12.18.2 Space-Level Matrix

| Action                | Space Admin |   Writer | Commenter |   Reader | No Access |
| --------------------- | ----------: | -------: | --------: | -------: | --------: |
| View pages            |         Yes |      Yes |       Yes |      Yes |        No |
| Create pages          |         Yes |      Yes |        No |       No |        No |
| Edit pages            |         Yes |      Yes |        No |       No |        No |
| Comment               |         Yes |      Yes |       Yes | Optional |        No |
| Manage members        |         Yes |       No |        No |       No |        No |
| Manage space settings |         Yes |       No |        No |       No |        No |
| Export space          |         Yes | Optional |        No |       No |        No |
| Public share          |    Optional | Optional |        No |       No |        No |

## 12.18.3 Page-Level Matrix

| Action              | Page Manager | Page Writer | Page Commenter | Page Reader | No Access |
| ------------------- | -----------: | ----------: | -------------: | ----------: | --------: |
| View page           |          Yes |         Yes |            Yes |         Yes |        No |
| Edit page           |          Yes |         Yes |             No |          No |        No |
| Comment             |          Yes |         Yes |            Yes |    Optional |        No |
| Manage restrictions |          Yes |          No |             No |          No |        No |
| Move/delete page    |          Yes |    Optional |             No |          No |        No |
| Verify page         |     Optional |    Optional |             No |          No |        No |
| Export page         |     Optional |    Optional |             No |    Optional |        No |

---

# 12.19 Technical Architecture Notes

## 12.19.1 Authorization Services

Recommended services:

* WorkspaceAccessService
* SpaceAccessService
* PageAccessService
* FeatureAccessService
* PublicShareAccessService
* ApiKeyAccessService
* AccessExplanationService

## 12.19.2 Core Permission Methods

Example methods:

```typescript
canViewWorkspace(user, workspace)
canManageWorkspace(user, workspace)
canViewSpace(user, space)
canEditSpace(user, space)
canManageSpace(user, space)
canViewPage(user, page)
canEditPage(user, page)
canCommentPage(user, page)
canManagePageAccess(user, page)
canExportPage(user, page)
canUseAi(user, workspace, space?)
canCreatePublicShare(user, page)
```

## 12.19.3 Permission Resolution Order

Recommended order:

1. Check authentication.
2. Check workspace membership.
3. Check workspace role.
4. Check feature entitlement if feature-gated.
5. Check space access.
6. Check page restrictions.
7. Check action-specific permission.
8. Check temporary/public/external access if applicable.
9. Return final allowed/denied decision.

## 12.19.4 Database Concepts

Recommended tables or models:

* workspace_members
* groups
* group_members
* space_members
* space_group_permissions
* page_access
* page_permissions
* public_shares
* api_keys
* audit_logs
* access_requests
* guest_access

## 12.19.5 Security Requirements

* All permission checks must happen on backend.
* Search must be permission-aware.
* AI retrieval must be permission-aware.
* Export must be permission-aware.
* Public links must be unguessable.
* API keys must be hashed.
* Sensitive permission changes must be audited.
* Access-denied responses must avoid leaking private content.

---

# 12.20 Global Acceptance Criteria for Permissions

The complete permissions system is accepted when:

* Admins can manage workspace roles.
* Admins can create groups and assign group permissions.
* Space admins can manage space access.
* Page managers can restrict pages.
* Child pages inherit restrictions correctly.
* Search never leaks restricted content.
* AI never uses inaccessible content.
* Exports include only allowed content.
* Public links obey workspace and space sharing controls.
* API keys and MCP tools obey permission rules.
* Guest users are isolated from internal workspace content.
* Permission changes are audit logged.
* Users can understand why they have access where appropriate.

---

# 12.21 Global Test Suite for Permissions

## Unit Tests

* Workspace role resolution.
* Group membership resolution.
* Space permission resolution.
* Page restriction inheritance.
* Feature entitlement checks.
* Public share validation.
* API key authorization.

## Integration Tests

* User invitation and role assignment.
* Group assignment to space.
* Page restriction and inherited restriction.
* Search filtering.
* AI retrieval filtering.
* Export filtering.
* Public sharing controls.
* Audit event creation.

## End-to-End Tests

* Admin creates group, assigns it to space, user accesses page.
* Page owner restricts page, unauthorized user loses access.
* User searches for restricted page and gets no result.
* AI answer excludes restricted page.
* Public link is created, opened, then revoked.
* Guest accesses only assigned client space.
* API key reads allowed page and fails on restricted page.

## Security Tests

* Direct API request to restricted page returns 403 or 404 according to security policy.
* Restricted page title is not leaked in search suggestions.
* Public share cannot access child restricted page unless explicitly shared.
* Removed user cannot access cached route or WebSocket collaboration session.
* API key cannot bypass user permissions.
* MCP tool cannot bypass permissions.

---

# 12.22 Recommended MVP Scope for Permissions

## MVP Permissions

* Workspace roles: Owner, Admin, Member.
* Groups.
* Space roles: Admin, Writer, Reader.
* Page-level restrictions.
* Basic public sharing permission.
* Permission-aware search.
* Backend authorization on all page operations.
* Audit logs for permission changes.

## Business Tier Permissions

* Commenter role.
* Viewer comments.
* Page-level granular permissions.
* API key permission model.
* Export permission control.
* Public sharing controls by workspace and space.
* Remove branding from public pages.

## Enterprise Tier Permissions

* Guest users.
* Access request workflow.
* SCIM group sync.
* Advanced access explanation.
* Central access management console.
* AI governance by role and space.
* MCP permission controls.
* Permission risk detection.
* Advanced audit and retention policies.

---

# 12.23 Final Summary

Permissions and Access Control are foundational to ConqrAI Wiki’s enterprise value. The system must go beyond basic roles and provide layered, explainable, auditable, and AI-aware access control.

The most important design rule is simple:

> Any feature that can read, generate, export, search, summarize, share, or automate knowledge must respect the same permission model as the human user.

This includes pages, spaces, comments, search, AI Search, AI Chat, MCP, API keys, exports, public sharing, notifications, and external guest access.

A strong permission system will make ConqrAI Wiki trustworthy for companies that need secure internal documentation, regulated workflows, client-specific knowledge spaces, and enterprise AI over private data.

# ConqrAI Wiki — Product Area 13: Public Sharing and External Access

## 13. Product Area: Public Sharing and External Access

## 13.1 Product Area Overview

Public Sharing and External Access define how ConqrAI Wiki allows selected documentation to be safely shared outside the internal workspace.

This product area turns the platform from only an internal company wiki into a controlled documentation distribution system for customers, partners, auditors, vendors, communities, and public readers.

The challenge is that public sharing is useful but risky. A simple public link can accidentally expose sensitive information if not designed correctly. Therefore, this module must be built around security, governance, permission checks, auditability, and clear UX.

Public Sharing and External Access should support three main scenarios:

1. **Public documentation**: product docs, API docs, help center, user guides, release notes.
2. **Controlled external collaboration**: client project docs, partner documentation, vendor instructions, auditor access.
3. **Temporary external sharing**: one page or one document shared for a limited period.

---

## 13.2 Product Vision

The vision for Public Sharing and External Access is:

> Allow teams to safely publish or share knowledge externally without compromising private workspace data.

The module should make external documentation easy enough for business users, while giving admins the controls required for enterprise governance.

## 13.3 Strategic Goals

### Goal 1: Safe External Sharing

Users should be able to share selected pages or spaces externally, but never expose private content accidentally.

### Goal 2: Public Documentation Portal

Organizations should be able to publish customer-facing documentation directly from ConqrAI Wiki.

### Goal 3: Client and Partner Access

Organizations should be able to invite external authenticated users to specific spaces/pages without giving them full workspace access.

### Goal 4: Governance and Auditability

Admins should know what is public, who shared it, when it was shared, and who accessed it.

### Goal 5: Brand Control

Companies should be able to customize public documentation, remove platform branding, and optionally use custom domains.

---

## 13.4 Personas

## 13.4.1 Internal Editor

Creates and shares documentation with customers, partners, or the public.

Needs:

* Simple share button.
* Clear public link state.
* Ability to revoke access.
* Confidence that only the selected content is exposed.

## 13.4.2 Workspace Admin

Controls external sharing policies.

Needs:

* Disable public sharing globally.
* Disable public sharing for sensitive spaces.
* Monitor public links.
* Revoke risky links.
* Audit sharing events.

## 13.4.3 Space Admin

Controls external access for one documentation area.

Needs:

* Enable/disable sharing for a space.
* Publish a space as public docs.
* Manage guest access.
* Control viewer comments or feedback.

## 13.4.4 External Reader

Reads public or shared documentation.

Needs:

* Fast, clean reading experience.
* Search inside public docs.
* Mobile-friendly layout.
* No internal workspace complexity.

## 13.4.5 External Client / Guest

Authenticated external person with limited access.

Needs:

* Access assigned pages/spaces only.
* Comment or collaborate if allowed.
* Clear separation from internal workspace.

---

# 13.5 Epic: Public Page Sharing

## 13.5.1 Feature: Create Public Link for a Page

### Use Case

A user wants to share one specific documentation page with someone outside the workspace without inviting them as a workspace member.

Examples:

* Share a product guide with a customer.
* Share a project summary with a partner.
* Share an API integration page with a developer.
* Share onboarding instructions with a contractor.

### User Stories

* As an editor, I want to create a public link for a page so that external readers can access it.
* As a page owner, I want to know when my page is publicly shared so that I can control exposure.
* As an admin, I want to restrict who can create public links so that sensitive documentation is not exposed.
* As an external reader, I want to open the shared page without creating an account so that access is easy.

### Acceptance Criteria

* Authorized users can create a public link from the page share menu.
* Public links use unguessable identifiers.
* A page can show whether it is publicly shared.
* Users can copy the public link.
* Unauthorized users cannot create public links.
* Public page rendering excludes private workspace data.
* Public page access respects workspace and space-level sharing controls.
* Public share creation is audit logged.

### Functional Requirements

* Create public share record.
* Generate unique share ID/token.
* Copy public URL.
* Show public sharing status on page.
* Show creator of public link.
* Show created date.
* Revalidate sharing policy on every public request.
* Support public read-only rendering.
* Audit public share creation.

### UX/UI Requirements

* Page top-right menu should include **Share**.
* Share modal should clearly separate:

  * Internal access.
  * Public link access.
  * Guest access, if supported.
* Public link section should show:

  * Public link enabled/disabled state.
  * Copy link button.
  * Revoke link button.
  * Optional advanced settings.
* If public sharing is disabled, show reason:

  * “Public sharing is disabled for this workspace.”
  * “Public sharing is disabled for this space.”
  * “You do not have permission to create public links.”

### Technical Notes

* Public share tokens must be cryptographically secure and unguessable.
* Public share access must not rely on authenticated workspace context.
* Public rendering should use a separate route such as `/share/:shareId/p/:pageSlug`.
* Public route should only load safe page data.
* Public content should not include private comments, page permissions, internal members, or hidden child pages.

### Test Cases

* Writer creates a public link for a page.
* Reader without share permission cannot create public link.
* Anonymous user opens public link successfully.
* Public page does not show internal sidebar.
* Public page does not show internal comments.
* Public share creation creates audit log.
* Disabled workspace sharing prevents link creation.

---

## 13.5.2 Feature: Revoke Public Link

### Use Case

A page was shared publicly, but the owner or admin wants to stop external access.

### User Stories

* As a page owner, I want to revoke a public link so that external access stops immediately.
* As an admin, I want to revoke any risky public link so that I can protect company information.
* As an external reader, I should no longer access the page after the link is revoked.

### Acceptance Criteria

* Authorized users can revoke public links.
* Revoked links stop working immediately.
* Revocation is audit logged.
* The page UI updates to show that public sharing is disabled.

### Functional Requirements

* Revoke public share.
* Mark share as deleted/revoked.
* Block public route after revocation.
* Audit revocation event.
* Optionally notify page owner/admin.

### UX/UI Requirements

* Revoke action requires confirmation.
* Confirmation should warn:

  * “Anyone with this link will lose access.”
* After revocation, show success message.
* Public unavailable page should be polite and not reveal private details.

### Technical Notes

* Public route should check share status on each request.
* Caching must not serve revoked content.
* If using CDN cache, revocation must purge or bypass cache.

### Test Cases

* Revoke link and verify anonymous access fails.
* Revoked link displays unavailable page.
* Revoke action creates audit event.
* Non-authorized user cannot revoke link.

---

## 13.5.3 Feature: Regenerate Public Link

### Use Case

A public link may have been accidentally shared too broadly. The owner wants to invalidate the old URL and create a new one.

### User Stories

* As a page owner, I want to regenerate a public link so that the old link no longer works.
* As an admin, I want regenerated links to be audited so that external access history remains traceable.

### Acceptance Criteria

* Authorized users can regenerate public links.
* Old public link stops working.
* New public link works.
* Regeneration is audit logged.

### Functional Requirements

* Generate new share token.
* Invalidate old token.
* Preserve share settings if desired.
* Audit regeneration.

### UX/UI Requirements

* Regenerate action should show confirmation.
* UI should explain that the old link will stop working.
* New link should be displayed with copy button.

### Technical Notes

* Regeneration should be transactional.
* Old token should not remain valid.

### Test Cases

* Regenerate link.
* Old link fails.
* New link works.
* Audit event is created.

---

# 13.6 Epic: Advanced Public Link Controls

## 13.6.1 Feature: Public Link Expiration

### Use Case

A team wants to share a page only for a limited time.

Examples:

* Share proposal documentation for 7 days.
* Share audit evidence for 30 days.
* Share onboarding instructions until a contractor starts.

### User Stories

* As an editor, I want to set an expiration date so that public access ends automatically.
* As an admin, I want temporary sharing so that external exposure is reduced.
* As an external reader, I want a clear message when a link has expired.

### Acceptance Criteria

* Public links can have an optional expiration date.
* Expired links are inaccessible.
* Expiration can be edited or removed by authorized users.
* Expired access is audit logged or recorded.

### Functional Requirements

* Set expiration date/time.
* Update expiration date/time.
* Remove expiration.
* Automatically block expired links.
* Show expiration status in share modal.
* Optional notification before expiration.

### UX/UI Requirements

* Use date/time picker.
* Show human-readable expiry:

  * “Expires in 6 days.”
  * “Expired on 2026-05-01.”
* Public expired page should show:

  * “This shared page is no longer available.”

### Technical Notes

* Public resolver checks `expiresAt` before loading page content.
* Scheduled cleanup may mark expired shares, but request-time validation is mandatory.

### Test Cases

* Link works before expiration.
* Link fails after expiration.
* Updating expiration extends access.
* Removing expiration makes link permanent again.

---

## 13.6.2 Feature: Password-Protected Public Links

### Use Case

A user wants a simple extra protection layer for external links.

### User Stories

* As a page owner, I want to add a password to a public link so that only people with the password can open it.
* As an external reader, I want to enter the password and access the page.
* As an admin, I want failed attempts rate-limited so that public links are not easily brute-forced.

### Acceptance Criteria

* Public links can optionally require a password.
* Passwords are not stored in plain text.
* External readers must enter password before content is displayed.
* Wrong password is rejected.
* Failed attempts are rate-limited.

### Functional Requirements

* Add password.
* Change password.
* Remove password.
* Validate password.
* Rate-limit failed password attempts.
* Track successful password unlock, optional.

### UX/UI Requirements

* Password protection should be under advanced link settings.
* Public password screen should be simple and branded.
* UI should explain that password links are still public-link based and not equivalent to authenticated guest access.

### Technical Notes

* Store hashed password.
* Use secure comparison.
* Consider signed temporary session after password success.
* Rate limit by IP/share ID.

### Test Cases

* Password-protected link shows password screen.
* Correct password opens page.
* Wrong password fails.
* Password removal allows direct access.
* Multiple wrong attempts trigger rate limit.

---

## 13.6.3 Feature: Public Link Download and Copy Controls

### Use Case

Some organizations want public readers to view content but not easily export or copy it.

### User Stories

* As an admin, I want to disable export/download for public pages so that content leakage is reduced.
* As a page owner, I want to control whether public users can download attachments.
* As an external reader, I want clear access to allowed downloads.

### Acceptance Criteria

* Public page can disable export buttons.
* Attachment downloads can be allowed or blocked depending on settings.
* Controls are enforced server-side.

### Functional Requirements

* Allow/disallow public export.
* Allow/disallow attachment download.
* Hide export/download UI when disabled.
* Server-check attachment access.

### UX/UI Requirements

* Share settings should include toggles:

  * Allow PDF export.
  * Allow attachment downloads.
* Disabled downloads should not show buttons.

### Technical Notes

* Copy prevention in browsers is not fully enforceable; avoid promising absolute protection.
* Attachment routes must validate public share permissions.

### Test Cases

* Public export disabled hides export button.
* Direct attachment URL fails when downloads disabled.
* Public export enabled allows download.

---

# 13.7 Epic: Public Space Documentation Portal

## 13.7.1 Feature: Publish Entire Space

### Use Case

A company wants to publish a complete documentation space as an external documentation portal.

Examples:

* Product documentation.
* Developer API documentation.
* Help center.
* Public knowledge base.
* Customer onboarding docs.

### User Stories

* As a product manager, I want to publish a space publicly so that customers can access product documentation.
* As a developer relations lead, I want public API documentation so that developers can integrate faster.
* As a documentation owner, I want public navigation so that users can browse all public pages easily.

### Acceptance Criteria

* Authorized users can publish a space.
* Public space has its own navigation.
* Only allowed pages are visible publicly.
* Restricted/private pages are excluded.
* Public space can be unpublished.
* Publishing/unpublishing is audit logged.

### Functional Requirements

* Enable public space.
* Disable public space.
* Generate public docs URL.
* Render public page tree.
* Public landing page.
* Public search.
* Public page breadcrumbs.
* Public page table of contents.
* Public theme settings.
* Public SEO metadata.

### UX/UI Requirements

* Space settings should include **Public Documentation** tab.
* Public portal preview should be available.
* Admin should see warnings before publishing.
* Public docs should be responsive, clean, and fast.

### Technical Notes

* Public space route can be `/docs/:spaceSlug` or custom domain.
* Public tree must filter inaccessible pages.
* Public pages should be cache-friendly.
* Public portal can have separate frontend layout from internal app.

### Test Cases

* Publish a space.
* Anonymous user views public space.
* Public page tree shows correct pages.
* Restricted page inside space is hidden.
* Unpublish space blocks public access.

---

## 13.7.2 Feature: Public Space Search

### Use Case

External readers need to search public documentation without accessing private workspace content.

### User Stories

* As an external reader, I want to search public docs so that I can find answers quickly.
* As an admin, I want public search to include only published content so that internal content is protected.

### Acceptance Criteria

* Public search returns only public pages.
* Public search does not expose internal page titles or snippets.
* Search results open public URLs.

### Functional Requirements

* Search within public space.
* Search title and content.
* Show snippets.
* Highlight matches.
* Filter by section/category, optional.
* Track no-result public searches, optional.

### UX/UI Requirements

* Public search input should be visible in public docs header.
* Results should show title, breadcrumb, and snippet.
* Empty state should suggest related pages or contact support.

### Technical Notes

* Public search can use separate index or permission-filtered query.
* Public search logs can feed documentation improvement analytics.

### Test Cases

* Search public docs returns public page.
* Search does not return private page.
* Search result opens public route.

---

## 13.7.3 Feature: Public Portal Branding

### Use Case

Companies want public documentation to match their brand and not look like a generic wiki.

### User Stories

* As an admin, I want to add our logo and brand colors so that public docs look professional.
* As a business owner, I want to remove platform branding so that docs feel like our product experience.
* As a customer, I want public docs to feel trustworthy and consistent with the company brand.

### Acceptance Criteria

* Admin can configure public docs branding.
* Branding settings apply to public pages and spaces.
* Remove-branding option is plan-gated.

### Functional Requirements

* Public logo.
* Public favicon.
* Brand color.
* Header links.
* Footer links.
* Remove “Powered by” branding.
* Custom CSS, optional enterprise.

### UX/UI Requirements

* Branding settings should include live preview.
* Remove branding should show locked state if plan does not allow it.
* Public portal should remain accessible and readable.

### Technical Notes

* Store branding settings at workspace and/or space level.
* Public pages should not load internal app-only scripts unnecessarily.

### Test Cases

* Logo appears on public docs.
* Brand color applies.
* Branding removal works for eligible plan.
* Locked branding removal shown for ineligible plan.

---

## 13.7.4 Feature: Custom Domain for Public Docs

### Use Case

A company wants documentation available at a branded domain such as `docs.company.com`.

### User Stories

* As an admin, I want to configure a custom domain so that customers access docs from our domain.
* As a security admin, I want domain verification so that nobody can claim a domain they do not own.

### Acceptance Criteria

* Admin can add custom domain.
* System provides DNS verification instructions.
* Domain becomes active only after verification.
* HTTPS is supported.

### Functional Requirements

* Add custom domain.
* Show DNS record instructions.
* Verify DNS.
* Show verification status.
* Remove custom domain.
* Support SSL/TLS certificate management.

### UX/UI Requirements

* Domain setup wizard.
* Clear DNS instructions.
* Status indicators: pending, verified, active, failed.
* Troubleshooting messages.

### Technical Notes

* Cloud deployments can manage certificates automatically.
* Self-hosted deployments may require reverse proxy configuration.
* Domain mapping should resolve workspace and public space safely.

### Test Cases

* Add domain.
* Verification pending before DNS record exists.
* Verification succeeds after DNS record.
* Public docs load on custom domain.
* Removing domain disables route.

---

# 13.8 Epic: Guest and External Authenticated Access

## 13.8.1 Feature: Invite External Guest

### Use Case

A company wants to collaborate with an external client, partner, auditor, or contractor while keeping internal knowledge private.

### User Stories

* As an admin, I want to invite a guest user so that they can access selected documentation.
* As a project manager, I want a client to access only their project space.
* As a security owner, I want guest access clearly separated from internal users.

### Acceptance Criteria

* Admins or authorized users can invite guests.
* Guests receive invitation email.
* Guests can access only explicitly assigned pages/spaces.
* Guests are labeled as external.
* Guest actions are audited.

### Functional Requirements

* Invite guest by email.
* Assign guest to page.
* Assign guest to space.
* Set guest role: reader, commenter, writer if allowed.
* Set expiration date.
* Resend invitation.
* Revoke invitation.
* Remove guest access.
* Deactivate guest.

### UX/UI Requirements

* Guest invite modal should show strong warning:

  * “This person is outside your workspace.”
* Guest badge should appear in members list.
* Guest access overview should show exactly what each guest can access.

### Technical Notes

* Guest users should have limited workspace discovery.
* Guest search should be scoped to assigned resources.
* Guest AI access should be disabled by default or scoped narrowly.

### Test Cases

* Invite guest to a space.
* Guest accepts invite.
* Guest sees assigned space.
* Guest cannot see unrelated space.
* Guest removal revokes access.

---

## 13.8.2 Feature: Guest Access Expiration

### Use Case

External access should not last forever, especially for contractors, auditors, or temporary clients.

### User Stories

* As an admin, I want guest access to expire automatically so that old external access is removed.
* As a project manager, I want client access to end after project closure.

### Acceptance Criteria

* Guest access can have expiration date.
* Expired guests cannot access assigned resources.
* Admins can extend or remove expiration.
* Expiration is visible in guest management UI.

### Functional Requirements

* Set guest expiration.
* Update expiration.
* Remove expiration.
* Auto-disable expired guest access.
* Notify admin before expiration, optional.
* Notify guest before expiration, optional.

### UX/UI Requirements

* Guest list should show expiration date.
* Expiring soon guests should be highlighted.
* Expired guests should show inactive status.

### Technical Notes

* Access checks must validate expiration at request time.
* Scheduled jobs can mark guests as expired.

### Test Cases

* Guest can access before expiration.
* Guest cannot access after expiration.
* Admin extends expiration and guest regains access.

---

## 13.8.3 Feature: External Access Overview

### Use Case

Admins need one place to review all external exposure: public links, published spaces, guests, and custom domains.

### User Stories

* As an admin, I want to see all public links so that I can revoke risky ones.
* As a security owner, I want to see all guests and their access so that external exposure is controlled.
* As a compliance owner, I want a report of external access for audits.

### Acceptance Criteria

* Admin can view all external access objects.
* Admin can filter by type, space, creator, date, and risk.
* Admin can revoke access from the overview.

### Functional Requirements

Overview includes:

* Public page links.
* Public spaces.
* Guest users.
* Expiring access.
* Password-protected links.
* Custom domains.
* Recently accessed public pages.
* Risk indicators.

Actions:

* Revoke public link.
* Unpublish space.
* Remove guest.
* Extend guest expiration.
* Open audit events.

### UX/UI Requirements

* Use dashboard cards for summary.
* Use tables for detailed review.
* Show risk badges:

  * Public link with no expiration.
  * Guest writer access.
  * Public docs with restricted pages excluded.
  * External access older than 90 days.

### Technical Notes

* External access overview should be admin-only.
* Risk indicators can be computed asynchronously.

### Test Cases

* Admin sees public links.
* Admin sees guest users.
* Admin revokes link from overview.
* Non-admin cannot access overview.

---

# 13.9 Epic: Sharing Controls and Governance

## 13.9.1 Feature: Workspace-Level Sharing Controls

### Use Case

Some companies want to disable all public sharing across the workspace.

### User Stories

* As an admin, I want to disable public sharing globally so that no internal page can be exposed.
* As a security owner, I want existing public links removed or blocked when public sharing is disabled.
* As a user, I want to understand why I cannot share publicly.

### Acceptance Criteria

* Admin can disable public sharing globally.
* Existing public links are blocked or deleted based on policy.
* Users cannot create new public links while disabled.
* Public sharing state is clear in the UI.
* Setting change is audit logged.

### Functional Requirements

* Toggle workspace public sharing.
* Block new public links.
* Block existing public links.
* Optionally delete existing public shares.
* Show disabled reason in share modal.
* Audit setting change.

### UX/UI Requirements

* Security settings should include public sharing control.
* Disabling public sharing should show confirmation:

  * “This may disable all existing public links.”
* Share modal should show disabled state.

### Technical Notes

* Public route must check workspace sharing setting before loading content.
* Existing share records can remain but be inactive due to global setting.

### Test Cases

* Disable workspace public sharing.
* Existing public link fails.
* User cannot create new public link.
* Re-enable sharing restores or keeps links depending on policy.

---

## 13.9.2 Feature: Space-Level Sharing Controls

### Use Case

Some spaces are safe for public docs while others must never be shared externally.

### User Stories

* As a space admin, I want to disable public sharing for a sensitive space so that pages cannot be exposed.
* As an admin, I want public sharing enabled only for selected spaces.
* As a user, I want clear feedback when sharing is blocked by space policy.

### Acceptance Criteria

* Space admins or workspace admins can disable sharing for a space.
* Pages in disabled spaces cannot be publicly shared.
* Existing public links in the space are blocked or revoked.
* Setting is audit logged.

### Functional Requirements

* Toggle public sharing per space.
* Block new public links for pages in space.
* Block public space publishing.
* Show policy in space settings.
* Audit setting changes.

### UX/UI Requirements

* Space settings should include Public Sharing section.
* Page share modal should show:

  * “Public sharing is disabled for this space.”

### Technical Notes

* Public resolver must check page’s space setting.
* Space-level policy should override page-level public link.

### Test Cases

* Disable sharing for space.
* Existing page public link fails.
* New public link creation blocked.
* Other spaces still allow sharing if workspace allows it.

---

## 13.9.3 Feature: Sharing Permission Policy

### Use Case

Admins want to define which roles can create public links or publish spaces.

### User Stories

* As an admin, I want only admins to create public links so that sharing is controlled.
* As a space admin, I want writers to share pages in approved spaces so that workflows are efficient.

### Acceptance Criteria

* Sharing permission can be role-based.
* Public space publishing can require higher permission than page link sharing.
* Unauthorized users see disabled sharing actions.

### Functional Requirements

* Configure who can create public page links.
* Configure who can publish spaces.
* Configure who can remove branding.
* Configure who can set custom domains.
* Configure who can invite guests.

### UX/UI Requirements

* Settings should explain each policy in plain language.
* Share buttons should be hidden or disabled based on policy.

### Technical Notes

* Policy should integrate with CASL/authorization layer.
* Server-side permission checks are mandatory.

### Test Cases

* Admin-only sharing policy blocks writers.
* Writer-sharing policy allows writers.
* Publishing public space requires space admin or workspace admin.

---

# 13.10 Epic: Public Feedback and Viewer Interaction

## 13.10.1 Feature: Public Feedback on Documentation

### Use Case

External readers may want to report unclear documentation, outdated instructions, or missing information.

### User Stories

* As an external reader, I want to mark a page as helpful or not helpful so that the company can improve docs.
* As a documentation owner, I want to see feedback so that I can improve public documentation.
* As a support team, I want feedback to create internal follow-up tasks.

### Acceptance Criteria

* Public readers can submit simple feedback if enabled.
* Feedback is visible to authorized internal users.
* Feedback does not create public comments unless allowed.
* Spam protection exists.

### Functional Requirements

* Helpful/not helpful vote.
* Optional feedback comment.
* Optional email field.
* Spam/rate limit protection.
* Feedback dashboard.
* Convert feedback to internal comment/task.

### UX/UI Requirements

* Public page footer should ask:

  * “Was this page helpful?”
* Feedback form should be short.
* Success state should thank the user.

### Technical Notes

* Feedback should be stored separately from internal comments.
* Rate limit by IP/public share.
* Avoid exposing internal users publicly.

### Test Cases

* Public reader submits helpful vote.
* Public reader submits written feedback.
* Feedback appears in internal dashboard.
* Rate limiting blocks spam.

---

## 13.10.2 Feature: Public Comments, Optional

### Use Case

For some public docs, companies may want readers to comment directly. For most enterprise contexts, this should be optional and disabled by default.

### User Stories

* As a documentation owner, I want to enable public comments on selected pages so that readers can ask questions.
* As an admin, I want moderation so that public comments do not become risky.

### Acceptance Criteria

* Public comments are disabled by default.
* Admins can enable public comments per space/page.
* Public comments can require moderation before display.
* Spam protection exists.

### Functional Requirements

* Enable public comments.
* Disable public comments.
* Submit public comment.
* Moderate comment.
* Approve/reject comment.
* Report spam.

### UX/UI Requirements

* Public comments should be visually separate from internal comments.
* Moderation queue should be available internally.

### Technical Notes

* Public comments should not expose internal comment threads.
* Consider using CAPTCHA or rate limiting.

### Test Cases

* Public comments disabled by default.
* Enabled public comment submitted.
* Comment requires moderation.
* Approved comment appears publicly.

---

# 13.11 Epic: Public Analytics

## 13.11.1 Feature: Public Page Analytics

### Use Case

Documentation owners need to understand how public content is used.

### User Stories

* As a product manager, I want to see views on public docs so that I know what customers read.
* As a documentation owner, I want to see no-result searches so that I can improve docs.
* As a support lead, I want to see low-rated docs so that support tickets can be reduced.

### Acceptance Criteria

* Public page views are tracked if analytics is enabled.
* Analytics respects privacy settings.
* Documentation owners can view analytics.

### Functional Requirements

* Track public page views.
* Track unique visitors, privacy-safe.
* Track search queries.
* Track no-result searches.
* Track helpful/not helpful feedback.
* Track referrers, optional.
* Show analytics by page and space.

### UX/UI Requirements

* Public analytics dashboard should show:

  * Top viewed pages.
  * Low-rated pages.
  * Search terms.
  * No-result searches.
  * Traffic trend.

### Technical Notes

* Analytics must respect privacy laws and deployment settings.
* Self-hosted customers may choose to disable analytics.
* Avoid storing unnecessary personal data.

### Test Cases

* Public page view increments count.
* Search query appears in analytics.
* No-result search is tracked.
* Analytics disabled stops tracking.

---

# 13.12 Epic: SEO and Discoverability

## 13.12.1 Feature: Public SEO Metadata

### Use Case

Public documentation should be discoverable by search engines when the company wants it indexed.

### User Stories

* As a marketing/product owner, I want public docs indexed by search engines so that users can find answers from Google.
* As an admin, I want to disable indexing for private public links so that temporary shares are not discoverable.

### Acceptance Criteria

* Public spaces can enable SEO indexing.
* Individual public links can be noindex by default.
* Page metadata includes title and description.
* Sitemap is generated for public docs spaces.

### Functional Requirements

* Configure index/noindex.
* Generate meta title.
* Generate meta description.
* Generate Open Graph metadata.
* Generate sitemap.
* Generate robots rules.
* Canonical URLs.

### UX/UI Requirements

* Public docs settings should include SEO tab.
* Explain difference between public access and search engine indexing.

### Technical Notes

* Public one-off links should usually default to noindex.
* Published public docs spaces can default to index if admin enables it.

### Test Cases

* SEO-enabled public page includes index metadata.
* Noindex public page includes noindex tag.
* Sitemap includes public docs pages only.
* Private/restricted pages excluded from sitemap.

---

# 13.13 Epic: Public AI Experience

## 13.13.1 Feature: Public AI Search for Published Docs

### Use Case

External readers want to ask questions about public documentation and receive AI answers grounded only in public docs.

### User Stories

* As a customer, I want to ask a question in public docs so that I can find answers faster.
* As a documentation owner, I want public AI to cite sources so that answers are trustworthy.
* As an admin, I want public AI to use only public content so that private data is protected.

### Acceptance Criteria

* Public AI Search can be enabled for public docs spaces.
* AI uses only public pages from that docs space.
* AI answer includes public source links.
* AI does not access internal pages, comments, or restricted content.

### Functional Requirements

* Enable public AI Search.
* Ask question in public docs.
* Retrieve from public index only.
* Generate answer.
* Cite public pages.
* Capture feedback.
* Rate limit public AI usage.

### UX/UI Requirements

* Public AI search box should be clearly labeled.
* AI answers should include citations.
* If no answer is found, suggest contacting support or browsing docs.

### Technical Notes

* Public AI retrieval must use a strict public-only corpus.
* Rate limiting and abuse protection are mandatory.
* Public AI may be plan-gated due to cost.

### Test Cases

* Public AI answers from public page.
* Restricted internal page is not used.
* Public AI rate limit triggers after repeated requests.
* Public AI cites public source.

---

# 13.14 Epic: Audit and Compliance for Sharing

## 13.14.1 Feature: Sharing Audit Events

### Use Case

Enterprise customers need traceability of external exposure.

### User Stories

* As a compliance owner, I want to know who created public links so that we can audit exposure.
* As a security owner, I want to know when public sharing was disabled or enabled.
* As an admin, I want to investigate accidental external access.

### Acceptance Criteria

* All sensitive sharing events are logged.
* Audit logs include actor, resource, timestamp, action, and metadata.
* Sharing audit events can be filtered.

### Functional Requirements

Audit events:

* Public link created.
* Public link revoked.
* Public link regenerated.
* Public link expiration changed.
* Public link password changed.
* Public space published.
* Public space unpublished.
* Workspace sharing disabled/enabled.
* Space sharing disabled/enabled.
* Guest invited.
* Guest removed.
* Guest access expired.
* Custom domain added/removed.

### UX/UI Requirements

* Audit event labels should be readable.
* Event details should link to page, space, user, or guest where allowed.

### Technical Notes

* Audit events should avoid storing public link passwords or secrets.
* Sensitive metadata should be redacted.

### Test Cases

* Creating public link logs event.
* Disabling workspace sharing logs event.
* Guest invite logs event.
* Audit filter by sharing events works.

---

# 13.15 Epic: Public Sharing Security

## 13.15.1 Feature: Public Access Safety Rules

### Use Case

Public routes must never leak private workspace information.

### User Stories

* As a security owner, I want public pages isolated from private workspace data.
* As an admin, I want restricted pages excluded from public spaces.
* As a user, I want confidence that sharing one page does not expose the whole workspace.

### Acceptance Criteria

* Public routes return only public-safe data.
* Restricted child pages are excluded.
* Internal comments are hidden unless explicitly allowed.
* Internal user data is minimized.
* Attachments require public access validation.

### Functional Requirements

* Validate share token.
* Validate workspace sharing policy.
* Validate space sharing policy.
* Validate page is shareable.
* Filter child pages.
* Filter attachments.
* Hide internal comments.
* Hide page permissions.
* Hide private metadata.

### UX/UI Requirements

* Public unavailable pages should not reveal whether content exists if security policy requires privacy.
* Public docs should show only intended navigation.

### Technical Notes

* Public DTOs should be separate from internal DTOs.
* Avoid reusing internal page payloads directly.
* Public API endpoints should have strict response schemas.

### Test Cases

* Public endpoint does not include permission metadata.
* Public endpoint does not include internal comments.
* Public page cannot access restricted attachment.
* Public page tree excludes restricted child pages.

---

# 13.16 Epic: Public Sharing Billing and Feature Gating

## 13.16.1 Feature: Plan-Based Sharing Capabilities

### Use Case

Public sharing features may vary by plan.

### User Stories

* As a product owner, I want public sharing controls to be plan-gated so that advanced governance is monetized.
* As a user, I want clear upgrade messaging when a sharing feature is unavailable.

### Acceptance Criteria

* Community, Business, and Enterprise plans expose different sharing capabilities.
* Locked features show upgrade messaging.
* Server blocks unavailable paid features.

### Functional Requirements

Community, suggested:

* Internal documentation only.
* Basic public sharing optional, depending on pricing strategy.

Business:

* Public page sharing.
* Disable public sharing workspace/space.
* Remove branding.
* Public space docs.
* Password/expiration, optional.

Enterprise:

* Guest access.
* Custom domains.
* Public AI Search.
* Advanced external access overview.
* Sharing audit analytics.
* Advanced public security policies.

### UX/UI Requirements

* Locked controls should show plan badge.
* Upgrade CTA should be clear but not disruptive.

### Technical Notes

* Use existing feature gating service and entitlements.
* Sharing endpoints must check entitlements server-side.

### Test Cases

* Free plan cannot remove branding.
* Business plan can disable public sharing.
* Enterprise can use guest access/custom domain if gated.

---

# 13.17 Data Model Recommendations

## 13.17.1 Public Shares

Recommended fields:

```typescript
type PublicShare = {
  id: string;
  workspaceId: string;
  spaceId: string;
  pageId?: string;
  shareType: 'page' | 'space';
  token: string;
  createdById: string;
  isEnabled: boolean;
  expiresAt?: string;
  passwordHash?: string;
  allowExport?: boolean;
  allowAttachmentDownload?: boolean;
  allowFeedback?: boolean;
  indexBySearchEngines?: boolean;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
  revokedById?: string;
};
```

## 13.17.2 Guest Access

Recommended fields:

```typescript
type GuestAccess = {
  id: string;
  workspaceId: string;
  guestUserId: string;
  resourceType: 'space' | 'page';
  resourceId: string;
  role: 'reader' | 'commenter' | 'writer';
  invitedById: string;
  expiresAt?: string;
  createdAt: string;
  revokedAt?: string;
};
```

## 13.17.3 Public Feedback

Recommended fields:

```typescript
type PublicFeedback = {
  id: string;
  workspaceId: string;
  shareId?: string;
  pageId: string;
  rating: 'helpful' | 'not_helpful';
  message?: string;
  email?: string;
  ipHash?: string;
  userAgent?: string;
  createdAt: string;
};
```

## 13.17.4 Public Analytics Event

Recommended fields:

```typescript
type PublicAnalyticsEvent = {
  id: string;
  workspaceId: string;
  shareId?: string;
  spaceId?: string;
  pageId?: string;
  eventType: 'view' | 'search' | 'feedback' | 'ai_question' | 'download';
  metadata?: Record<string, unknown>;
  ipHash?: string;
  createdAt: string;
};
```

---

# 13.18 API Endpoint Recommendations

## 13.18.1 Public Share Management

```text
POST /api/pages/:pageId/share/public/create
POST /api/pages/:pageId/share/public/revoke
POST /api/pages/:pageId/share/public/regenerate
POST /api/pages/:pageId/share/public/update
POST /api/pages/:pageId/share/public/info
```

## 13.18.2 Public Space Management

```text
POST /api/spaces/:spaceId/public/enable
POST /api/spaces/:spaceId/public/disable
POST /api/spaces/:spaceId/public/settings
POST /api/spaces/:spaceId/public/preview
```

## 13.18.3 Public Read Routes

```text
GET /share/:shareId/p/:pageSlug
GET /docs/:spaceSlug
GET /docs/:spaceSlug/p/:pageSlug
POST /public/search
POST /public/feedback
POST /public/ai/answers
```

## 13.18.4 Guest Access

```text
POST /api/guests/invite
POST /api/guests/access/add
POST /api/guests/access/remove
POST /api/guests/access/update
POST /api/guests/list
POST /api/guests/deactivate
```

## 13.18.5 External Access Overview

```text
POST /api/external-access/overview
POST /api/external-access/public-links
POST /api/external-access/guests
POST /api/external-access/risks
```

---

# 13.19 UX/UI Structure

## 13.19.1 Page Share Modal

Sections:

1. Internal access.
2. Public link.
3. Guest access.
4. Advanced settings.
5. Audit/access history, optional.

Public link controls:

* Enable public link.
* Copy link.
* Revoke link.
* Regenerate link.
* Expiration date.
* Password protection.
* Allow export.
* Allow attachment download.
* Allow feedback.
* Search engine indexing.

## 13.19.2 Space Public Docs Settings

Sections:

1. Publish status.
2. Public URL.
3. Navigation preview.
4. Branding.
5. SEO.
6. Public search.
7. Public AI Search.
8. Feedback.
9. Custom domain.
10. Security.

## 13.19.3 External Access Admin Console

Sections:

1. Summary cards.
2. Public links table.
3. Public spaces table.
4. Guests table.
5. Custom domains.
6. Sharing risks.
7. Recent sharing audit events.

---

# 13.20 Global Acceptance Criteria

The Public Sharing and External Access module is complete when:

* Users can create and revoke public page links.
* Admins can disable public sharing globally.
* Space admins can disable public sharing per space.
* Published spaces can function as public documentation portals.
* Public search includes only public content.
* Public pages never expose private workspace data.
* Guests can be invited with limited authenticated access.
* Guest access can expire and be revoked.
* Admins can view all external access from one console.
* Public sharing events are audit logged.
* Public branding can be customized according to plan.
* Public AI Search, if enabled, uses only public content.
* Exports/downloads from public pages obey public share settings.

---

# 13.21 Global Test Suite

## Unit Tests

* Public share token generation.
* Public share expiration validation.
* Password validation.
* Sharing policy resolution.
* Guest access resolution.
* Public DTO serialization.

## Integration Tests

* Create public link.
* Revoke public link.
* Publish public space.
* Public search.
* Guest invite and access.
* Workspace sharing disabled.
* Space sharing disabled.
* Audit event creation.

## End-to-End Tests

* User creates public link, anonymous reader opens it, user revokes it.
* Admin publishes public docs space, anonymous reader browses pages.
* Admin disables public sharing, all public links stop working.
* Guest is invited to client space and cannot access internal space.
* Public feedback is submitted and appears internally.
* Public AI answers only from public docs.

## Security Tests

* Public route does not expose internal comments.
* Public route does not expose page permissions.
* Public search does not reveal private titles.
* Restricted child page does not appear in public page tree.
* Direct attachment URL fails when public attachment download is disabled.
* Revoked link cannot be accessed from cache.
* Expired guest cannot access assigned space.

---

# 13.22 MVP Scope Recommendation

## MVP

* Public page links.
* Revoke public links.
* Workspace-level public sharing toggle.
* Space-level public sharing toggle.
* Public read-only page renderer.
* Basic audit events.
* Public link status in page share modal.

## Business Scope

* Public space documentation portal.
* Remove public branding.
* Public search.
* Link expiration.
* Password-protected links.
* Attachment download controls.
* Public feedback.
* External access overview.

## Enterprise Scope

* Authenticated guest users.
* Guest access expiration.
* Custom domains.
* Public AI Search.
* Advanced sharing audit analytics.
* Public docs SEO controls.
* External access risk detection.
* Advanced security policies.

---

# 13.23 Final Summary

Public Sharing and External Access are essential for turning ConqrAI Wiki into both an internal knowledge platform and an external documentation system.

The module must be designed with a strict security mindset:

> Sharing one page must never expose the workspace.

The strongest version of this product area includes public page links, public documentation portals, guest access, custom domains, public search, public AI Search, external access analytics, and strong admin governance.

For ConqrAI Wiki, this module can become a major differentiator because it connects internal knowledge, customer-facing documentation, and AI-powered public support in one controlled platform.

# ConqrAI Wiki — Complete Product Areas 13 to 24

## Document Purpose

This document continues the product requirements documentation for ConqrAI Wiki from **Product Area 13 until the end**. It follows the structure:

**Product Area / Module → Epic → Feature → Use Cases → User Stories → Acceptance Criteria → Functional Requirements → UX/UI Requirements → Technical Notes → Test Cases**

---

# 13. Product Area: Public Sharing and External Access

## 13.1 Product Area Overview

Public Sharing and External Access allow selected ConqrAI Wiki content to be safely shared outside the internal workspace. This includes public page links, public documentation portals, external guest access, partner/client collaboration, and controlled access for auditors or contractors.

The main challenge is balancing convenience with security. External sharing must never expose private workspace data, restricted pages, internal comments, private attachments, hidden metadata, or AI-generated answers based on inaccessible content.

## 13.2 Epic: Public Page Sharing

### Feature 13.2.1: Public Page Link

#### Use Cases

* A product manager shares a product guide with a customer.
* A developer shares API integration instructions with a partner.
* A consultant shares project documentation with a client.
* HR shares onboarding instructions with a contractor.

#### User Stories

* As an editor, I want to create a public link for a page so that external users can read it.
* As an admin, I want to control who can create public links so that sensitive content is protected.
* As an external reader, I want to open a public page without needing a workspace account.

#### Acceptance Criteria

* Authorized users can create a public link for a page.
* Public links use secure, unguessable identifiers.
* Unauthorized users cannot create public links.
* Public pages render without internal workspace navigation.
* Public pages do not expose internal comments, permissions, or private metadata.
* Public share creation is audit logged.

#### Functional Requirements

* Create public share.
* Copy public URL.
* Revoke public URL.
* Regenerate public URL.
* Display public sharing status.
* Validate workspace-level sharing policy.
* Validate space-level sharing policy.
* Validate page shareability.
* Audit all public link changes.

#### UX/UI Requirements

* Add a **Share** button in the page header.
* Share modal should include Internal Access, Public Link, and Advanced Settings sections.
* Show clear disabled states when sharing is blocked.
* Provide a one-click copy link button.
* Require confirmation before revoking public access.

#### Technical Notes

* Public routes should use a separate public DTO, not internal page payloads.
* Public route should check share status, workspace policy, space policy, page status, expiration, and password requirements.
* Public link tokens should be generated using cryptographically secure randomness.

#### Test Cases

* Create public link as authorized user.
* Block public link creation for unauthorized user.
* Anonymous user opens public link.
* Revoked link no longer works.
* Public page does not expose private comments or permissions.

---

### Feature 13.2.2: Public Link Expiration and Password Protection

#### Use Cases

* Share a proposal for 7 days.
* Share audit evidence for 30 days.
* Share a page with a password for light protection.

#### User Stories

* As a page owner, I want to set an expiration date so that external access ends automatically.
* As a page owner, I want to add a password so that only people with the password can open the page.
* As an admin, I want failed password attempts rate-limited to reduce abuse.

#### Acceptance Criteria

* Public links can have optional expiration dates.
* Expired links become inaccessible.
* Public links can optionally require a password.
* Passwords are stored securely, never in plain text.
* Failed password attempts are rate-limited.

#### Functional Requirements

* Set expiration date.
* Update expiration date.
* Remove expiration.
* Add password.
* Change password.
* Remove password.
* Validate password.
* Rate-limit failed attempts.

#### UX/UI Requirements

* Advanced public link settings should include expiration and password controls.
* Expiration should show human-readable state, such as “Expires in 6 days.”
* Public password screen should be simple and branded.

#### Technical Notes

* Validate expiration at request time, not only through scheduled jobs.
* Hash public link passwords.
* Use secure comparison for password validation.

#### Test Cases

* Link works before expiration.
* Link fails after expiration.
* Correct password unlocks public page.
* Wrong password is rejected.
* Repeated wrong passwords trigger rate limit.

---

## 13.3 Epic: Public Documentation Portal

### Feature 13.3.1: Publish Space as Public Docs

#### Use Cases

* Publish product documentation.
* Publish API documentation.
* Publish help center content.
* Publish release notes.
* Publish user guides.

#### User Stories

* As a product owner, I want to publish a space publicly so that customers can browse documentation.
* As a developer relations lead, I want a public API docs portal so that developers can integrate faster.
* As an admin, I want restricted pages excluded from public docs so that private content remains protected.

#### Acceptance Criteria

* Authorized users can publish a space.
* Public space has navigation and public page routes.
* Restricted pages are excluded from public navigation.
* Unpublishing a space immediately blocks public access.
* Publishing and unpublishing are audit logged.

#### Functional Requirements

* Enable public space.
* Disable public space.
* Generate public docs URL.
* Render public page tree.
* Render public page content.
* Support public breadcrumbs.
* Support table of contents.
* Support public search.
* Support branding settings.

#### UX/UI Requirements

* Space settings should include a **Public Documentation** section.
* Provide public preview before publishing.
* Warn users before making a space public.
* Public docs should be clean, responsive, and optimized for reading.

#### Technical Notes

* Public docs should use a public-safe route and DTO layer.
* Public space navigation must be permission-filtered.
* Public pages should be cache-friendly, with safe invalidation.

#### Test Cases

* Publish a space.
* Anonymous user browses public docs.
* Restricted page is not shown publicly.
* Unpublish space blocks public docs.
* Publish event appears in audit logs.

---

### Feature 13.3.2: Public Search and Public AI Search

#### Use Cases

* A customer searches public product docs.
* A developer asks an AI question about public API documentation.
* A support team reduces tickets by allowing customers to self-serve answers.

#### User Stories

* As an external reader, I want to search public documentation so that I can find answers quickly.
* As a customer, I want to ask natural-language questions about public docs so that I do not need to browse manually.
* As an admin, I want public AI to use only public content so that private data is never leaked.

#### Acceptance Criteria

* Public search returns only public pages.
* Public AI Search uses only public documentation corpus.
* AI answers include public source citations.
* Public AI requests are rate-limited.
* Public AI can be disabled.

#### Functional Requirements

* Public full-text search.
* Public search snippets.
* Public no-result tracking.
* Public AI question input.
* Public AI answer generation.
* Public AI citations.
* Public AI feedback.
* Rate limiting.
* Abuse protection.

#### UX/UI Requirements

* Public docs header should include search.
* Public AI search should be clearly labeled.
* AI answers should separate answer and sources.
* If no answer exists, suggest related pages or contact support.

#### Technical Notes

* Maintain strict public-only retrieval scope.
* Never query internal workspace index without public filter.
* Public AI can be plan-gated due to cost.

#### Test Cases

* Public search finds public page.
* Public search excludes private page.
* Public AI cites public source.
* Public AI does not use restricted content.
* Rate limit triggers after repeated usage.

---

## 13.4 Epic: Guest and External Authenticated Access

### Feature 13.4.1: Guest Users

#### Use Cases

* Invite a client to a client-specific project space.
* Invite an auditor to compliance evidence pages.
* Invite a contractor to onboarding documentation.
* Invite a partner to integration documentation.

#### User Stories

* As an admin, I want to invite guests so that external people can access selected content.
* As a client, I want access only to my project documentation.
* As a security owner, I want guest access clearly separated from internal member access.

#### Acceptance Criteria

* Guests access only assigned spaces/pages.
* Guests are visibly labeled as external users.
* Guest access can expire.
* Guest access can be revoked.
* Guest activity is audit logged.

#### Functional Requirements

* Invite guest by email.
* Assign guest to page.
* Assign guest to space.
* Set guest role: reader/commenter/writer, depending on policy.
* Set expiration date.
* Resend invite.
* Revoke invite.
* Remove guest.
* View external access overview.

#### UX/UI Requirements

* Guest invitation flow should include a warning about external access.
* Guest badge should appear in members lists and comments.
* Admin console should show all guests and their accessible resources.

#### Technical Notes

* Guest users should have limited discovery by default.
* Guest search should be scoped to assigned resources.
* Guest AI access should be disabled or tightly scoped by default.

#### Test Cases

* Invite guest to a space.
* Guest can access assigned space.
* Guest cannot access unrelated space.
* Guest access expires.
* Removing guest revokes access.

---

## 13.5 Epic: External Sharing Governance

### Feature 13.5.1: Workspace and Space Sharing Controls

#### Use Cases

* A company disables all public sharing for security.
* HR disables sharing for HR space only.
* Product enables sharing only for public documentation space.

#### User Stories

* As an admin, I want to disable public sharing workspace-wide so that no internal content can be exposed.
* As a space admin, I want to disable public sharing for sensitive spaces.
* As a user, I want to understand why sharing is blocked.

#### Acceptance Criteria

* Workspace public sharing can be enabled/disabled.
* Space public sharing can be enabled/disabled.
* Existing public links are blocked or revoked based on policy.
* UI clearly explains why sharing is unavailable.
* Sharing policy changes are audit logged.

#### Functional Requirements

* Workspace sharing toggle.
* Space sharing toggle.
* Role-based sharing policy.
* Block new public shares.
* Block existing public shares.
* Audit setting changes.
* External access overview.

#### UX/UI Requirements

* Security settings should include public sharing controls.
* Space settings should show sharing status.
* Share modal should display blocked reason.
* External Access dashboard should list all public links and guests.

#### Technical Notes

* Public route must evaluate workspace and space policy on every request.
* Existing share records can remain but become inactive due to policy.

#### Test Cases

* Disable workspace sharing and verify all public links fail.
* Disable space sharing and verify pages in that space cannot be shared.
* Re-enable sharing according to chosen policy.
* Audit log records setting change.

---

# 14. Product Area: Security and Authentication

## 14.1 Product Area Overview

Security and Authentication protect workspace identity, user sessions, login methods, enterprise access controls, and sensitive configuration. This product area includes email/password authentication, OAuth, SSO, MFA, session security, allowed domains, API authentication, and enterprise identity integrations.

## 14.2 Epic: Core Authentication

### Feature 14.2.1: Email and Password Authentication

#### Use Cases

* A small team signs up using email/password.
* A self-hosted customer uses local authentication before configuring SSO.
* A user resets a forgotten password.

#### User Stories

* As a user, I want to log in with email and password so that I can access my workspace.
* As a user, I want to reset my password so that I can recover access.
* As an admin, I want secure password rules so that accounts are protected.

#### Acceptance Criteria

* Users can register or be invited depending on workspace settings.
* Users can log in with valid credentials.
* Invalid credentials are rejected safely.
* Password reset flow works through email.
* Passwords are never stored in plain text.

#### Functional Requirements

* Login.
* Logout.
* Invite-based signup.
* Password reset request.
* Password reset confirmation.
* Password policy validation.
* Account activation/deactivation.
* Session creation.
* Session invalidation.

#### UX/UI Requirements

* Login form must be simple and secure.
* Password reset should not reveal whether an email exists.
* Error messages should be clear but not leak security information.

#### Technical Notes

* Store hashed passwords with a strong hashing algorithm.
* Use secure HTTP-only cookies for JWT/session where applicable.
* Add login rate limiting.
* Audit login and logout events.

#### Test Cases

* Login with valid password succeeds.
* Login with invalid password fails.
* Password reset email is sent.
* Deactivated user cannot log in.
* Repeated failed logins are rate-limited.

---

## 14.3 Epic: SSO

### Feature 14.3.1: SAML, OIDC, Google OAuth and LDAP SSO

#### Use Cases

* Enterprise customer uses Okta with SAML.
* Company uses Azure AD through OIDC.
* Self-hosted customer uses LDAP/Active Directory.
* Smaller company uses Google OAuth.

#### User Stories

* As an IT admin, I want to configure SSO so that employees use company identity.
* As an admin, I want to enforce SSO so that password login is disabled.
* As a user, I want one-click login with my company account.

#### Acceptance Criteria

* Admins can configure SSO providers.
* Users can authenticate through enabled provider.
* Workspace can enforce SSO.
* SSO configuration changes are audit logged.
* Secrets are stored securely.

#### Functional Requirements

* Create provider.
* Update provider.
* Delete provider.
* Enable/disable provider.
* Configure SAML URL/certificate.
* Configure OIDC issuer/client credentials.
* Configure LDAP URL/bind/base/search attributes.
* Configure Google OAuth.
* Enforce SSO.
* Optional group sync.

#### UX/UI Requirements

* Provider setup should be guided.
* Show callback URLs clearly.
* Add “Test connection” action.
* Warn before enforcing SSO.

#### Technical Notes

* Use Passport strategies.
* Encrypt provider secrets.
* Provide safe fallback or break-glass admin policy where required.

#### Test Cases

* Configure OIDC provider.
* Login through provider.
* Enforce SSO blocks password login.
* Disable provider blocks provider login.
* SSO event is audited.

---

## 14.4 Epic: Multi-Factor Authentication

### Feature 14.4.1: TOTP MFA and Backup Codes

#### Use Cases

* Security-conscious user enables MFA.
* Admin enforces MFA for all workspace members.
* User loses authenticator and uses backup code.

#### User Stories

* As a user, I want to enable MFA so that my account is safer.
* As an admin, I want to enforce MFA so that all accounts are protected.
* As a user, I want backup codes so that I can recover access.

#### Acceptance Criteria

* User can set up TOTP MFA with QR code.
* Login requires MFA after password when enabled.
* Backup codes work once.
* Admin can enforce MFA workspace-wide.
* MFA events are audited.

#### Functional Requirements

* Start MFA setup.
* Generate QR code.
* Verify TOTP.
* Enable MFA.
* Disable MFA.
* Generate backup codes.
* Regenerate backup codes.
* Verify MFA during login.
* Enforce MFA.

#### UX/UI Requirements

* MFA setup should be step-by-step.
* Backup codes should be copyable/downloadable and shown once.
* Enforced users should see setup-required screen.

#### Technical Notes

* Store MFA secret encrypted.
* Store backup codes hashed.
* Rate-limit MFA attempts.

#### Test Cases

* Enable MFA with valid code.
* Reject invalid TOTP.
* Login requires MFA.
* Backup code works once.
* Enforced MFA blocks app access until configured.

---

## 14.5 Epic: Security Controls

### Feature 14.5.1: Workspace Security Settings

#### Use Cases

* Admin restricts signup to allowed domains.
* Admin disables public sharing.
* Admin restricts API key creation.
* Admin configures session duration.

#### User Stories

* As an admin, I want central security controls so that workspace risk is managed.
* As a security owner, I want to restrict access by domain so that only company emails join.
* As an admin, I want to control API key creation so that integrations are governed.

#### Acceptance Criteria

* Security settings are admin-only.
* Settings changes are audit logged.
* Security settings affect system behavior immediately.

#### Functional Requirements

* Allowed email domains.
* Enforce SSO.
* Enforce MFA.
* Disable public sharing.
* Restrict API key creation.
* Restrict export.
* Restrict AI usage.
* Configure session duration.
* Configure guest access policy.

#### UX/UI Requirements

* Security page should be grouped by authentication, sharing, API, AI, and data controls.
* Dangerous settings require confirmation.
* Explain each setting clearly.

#### Technical Notes

* Security settings should be evaluated server-side.
* Some settings may be feature-gated by plan.

#### Test Cases

* Allowed domain blocks non-company invite/signup.
* Restrict API key creation blocks members.
* Security setting change appears in audit log.

---

# 15. Product Area: Enterprise Compliance and Administration

## 15.1 Product Area Overview

Enterprise Compliance and Administration provide traceability, governance, lifecycle controls, audit evidence, retention policies, data management, and admin visibility for organizations with strict security and compliance requirements.

## 15.2 Epic: Audit Logs

### Feature 15.2.1: Workspace Audit Trail

#### Use Cases

* Compliance team investigates who changed a policy page.
* Security team investigates who created a public link.
* Admin reviews permission changes before an audit.

#### User Stories

* As a compliance owner, I want audit logs so that I can prove governance.
* As a security owner, I want to filter logs by actor, event, and date so that investigations are efficient.
* As an admin, I want exportable audit logs for compliance reporting.

#### Acceptance Criteria

* Critical events are recorded.
* Audit logs include actor, event, resource, timestamp, IP, and metadata where appropriate.
* Audit logs can be filtered.
* Audit logs are immutable for normal users.
* Audit logs follow retention policy.

#### Functional Requirements

Track events for:

* Workspace changes.
* User login/logout.
* User role changes.
* Page create/update/delete/restore.
* Space create/update/delete.
* Comments create/update/delete/resolve.
* Permission changes.
* Public share changes.
* API key changes.
* SSO/MFA changes.
* Import/export events.
* Page verification events.
* AI tool usage.
* Guest access changes.

#### UX/UI Requirements

* Audit table with filters.
* Event detail drawer.
* Readable event labels.
* Export audit logs, if allowed.
* Date range picker.

#### Technical Notes

* Use asynchronous audit queue.
* Audit events should be immutable.
* Sensitive values should be redacted.

#### Test Cases

* Page deletion creates audit event.
* Permission change creates audit event.
* Filter by actor works.
* Retention cleanup removes old logs according to policy.

---

## 15.3 Epic: Retention Controls

### Feature 15.3.1: Data Retention Policies

#### Use Cases

* Delete trashed pages after 90 days.
* Keep audit logs for 1 year.
* Delete AI chats after 30 days.
* Remove old export files automatically.

#### User Stories

* As an admin, I want trash retention so that old deleted content is cleaned.
* As a compliance owner, I want audit retention so that logs are kept according to policy.
* As a security owner, I want AI chat retention so that sensitive prompts do not remain forever.

#### Acceptance Criteria

* Admin can configure retention policies.
* Scheduled jobs enforce retention.
* Cleanup actions are logged.
* Retention settings are admin-only.

#### Functional Requirements

* Trash retention.
* Audit log retention.
* AI chat retention.
* Export file retention.
* Attachment retention, optional.
* Legal hold, future enterprise.
* Cleanup job monitoring.

#### UX/UI Requirements

* Retention settings should explain consequences.
* Use amount + unit controls: days, months, years.
* Show next cleanup time.

#### Technical Notes

* Retention jobs must be idempotent.
* Use BullMQ scheduled jobs.
* Legal hold should override deletion if implemented.

#### Test Cases

* Old trashed page is deleted after retention period.
* Recent trashed page remains.
* Audit logs older than policy are removed.
* Retention change is audited.

---

## 15.4 Epic: Admin Console

### Feature 15.4.1: System and Workspace Administration

#### Use Cases

* Admin monitors users, spaces, public links, and security risks.
* Self-hosted admin checks system health.
* Owner reviews license and billing state.

#### User Stories

* As an admin, I want one place to manage workspace operations.
* As a self-hosted admin, I want system health visibility so that I can diagnose issues.
* As an owner, I want to see license status so that I know which features are enabled.

#### Acceptance Criteria

* Admin console is accessible only to authorized users.
* Console shows workspace health and administrative shortcuts.
* Self-hosted system status is visible where applicable.

#### Functional Requirements

* User management overview.
* Group management overview.
* Space management overview.
* External access overview.
* Security status.
* Audit log access.
* License/billing status.
* Queue/system health, self-hosted.
* Storage usage.
* AI usage.

#### UX/UI Requirements

* Use dashboard cards.
* Show warnings for risky configuration.
* Provide direct links to fix issues.

#### Technical Notes

* Expensive metrics should be precomputed.
* Admin console should rely on permission-checked APIs.

#### Test Cases

* Admin opens console.
* Member cannot open console.
* Security warning appears for public links.
* Storage usage updates after file upload.

---

# 16. Product Area: Import and Export

## 16.1 Product Area Overview

Import and Export allow organizations to migrate into ConqrAI Wiki, move knowledge between systems, create backups, and share documentation in external formats.

## 16.2 Epic: Import

### Feature 16.2.1: Markdown, HTML, DOCX, Notion and Confluence Import

#### Use Cases

* Company migrates from Confluence.
* Team imports Notion workspace exports.
* User imports DOCX policy documents.
* Developer imports Markdown docs.

#### User Stories

* As an admin, I want to import Confluence spaces so that migration is easy.
* As a user, I want to import Markdown and DOCX files so that existing docs become wiki pages.
* As a team lead, I want import progress and error reporting so that migration is predictable.

#### Acceptance Criteria

* Supported formats can be uploaded and converted.
* Import preserves hierarchy where possible.
* Import preserves attachments where possible.
* Large imports run as background jobs.
* Import errors are reported clearly.

#### Functional Requirements

* Import Markdown.
* Import HTML.
* Import DOCX.
* Import Notion ZIP.
* Import Confluence ZIP.
* Import ZIP of pages.
* Preserve hierarchy.
* Preserve links.
* Preserve attachments.
* Show progress.
* Show import summary.
* Show error report.
* Rollback import, advanced.

#### UX/UI Requirements

* Import wizard.
* Target space selector.
* File upload zone.
* Preview detected structure.
* Progress bar.
* Error report download.

#### Technical Notes

* Use background queue for large imports.
* Convert content into ProseMirror JSON.
* DOCX can use mammoth-like conversion.
* Store import job records.

#### Test Cases

* Import Markdown page.
* Import DOCX file.
* Import Confluence ZIP.
* Large import shows progress.
* Failed file appears in error report.

---

## 16.3 Epic: Export

### Feature 16.3.1: Markdown, HTML, PDF and Space Export

#### Use Cases

* Export a page as PDF for a client.
* Export a space as ZIP for backup.
* Export technical docs as Markdown.
* Export compliance documents for audit evidence.

#### User Stories

* As a user, I want to export a page so that I can share it offline.
* As an admin, I want to export a space so that I can archive it.
* As a security owner, I want exports to respect permissions.

#### Acceptance Criteria

* Users can export allowed content.
* Export respects page and space permissions.
* Long exports run as background jobs.
* PDF export works when configured.
* Export events are audited.

#### Functional Requirements

* Export page as Markdown.
* Export page as HTML.
* Export page as PDF.
* Export page with children.
* Export space as ZIP.
* Include attachments.
* Rewrite internal links.
* Notify user when export is ready.
* Expire export files after retention period.

#### UX/UI Requirements

* Export menu should show available formats.
* Export modal should explain what will be included.
* Show export job status for large exports.

#### Technical Notes

* PDF can use Gotenberg.
* Export jobs must run with requesting user context.
* Export service must re-check access for every included page.

#### Test Cases

* Export page as PDF.
* Export space as ZIP.
* Restricted child page excluded from export.
* Export event appears in audit logs.
* Export fails clearly if PDF service unavailable.

---

# 17. Product Area: Templates and Documentation Standards

## 17.1 Product Area Overview

Templates standardize documentation creation. They help teams write faster, improve quality, enforce structure, and support repeatable processes.

## 17.2 Epic: Page Templates

### Feature 17.2.1: Workspace and Space Templates

#### Use Cases

* Product team uses PRD template.
* Engineering team uses technical specification template.
* DevOps uses runbook template.
* HR uses policy template.
* Customer success uses client onboarding template.

#### User Stories

* As a knowledge manager, I want templates so that documentation is consistent.
* As a user, I want to create a page from a template so that I do not start from blank.
* As an admin, I want to control who can create official templates.

#### Acceptance Criteria

* Users with permission can create templates.
* Templates can be workspace-wide or space-specific.
* Users can create pages from templates.
* Templates are searchable.
* Template creation can be restricted.

#### Functional Requirements

* Create template.
* Edit template.
* Delete template.
* Preview template.
* Use template.
* Categorize templates.
* Set template scope.
* Search templates.
* Restrict template creation.
* AI-generate template, advanced.

#### UX/UI Requirements

* Template gallery with categories.
* Template preview before use.
* Suggested templates during page creation.
* Clear official/community template distinction if needed.

#### Technical Notes

* Store template content as ProseMirror JSON/Yjs-compatible data.
* Index templates for search.
* Apply permissions by workspace/space scope.

#### Test Cases

* Create workspace template.
* Create space template.
* Use template to create page.
* Unauthorized user cannot create template.
* Template appears in search.

---

## 17.3 Epic: Documentation Standards

### Feature 17.3.1: Standardized Document Types

#### Use Cases

* Architecture decisions need consistent ADR format.
* Incident reports need standard postmortem format.
* API docs need consistent endpoint structure.

#### User Stories

* As a technical lead, I want standardized document types so that engineering docs are easy to read.
* As a knowledge manager, I want required sections so that important information is not missed.

#### Acceptance Criteria

* System includes default template library.
* Admin can customize templates.
* AI can suggest a template based on page intent.

#### Functional Requirements

Default templates:

* PRD.
* Technical specification.
* ADR.
* API documentation.
* Database schema documentation.
* Runbook.
* Incident report.
* Postmortem.
* Meeting notes.
* Onboarding guide.
* Security policy.
* HR policy.
* Release notes.
* QA test plan.
* Deployment guide.

#### UX/UI Requirements

* Template categories should be clear: Product, Engineering, Operations, HR, Security, Support.
* Template descriptions should explain when to use each one.

#### Technical Notes

* Seed default templates during installation or first workspace setup.
* Allow versioning of templates in future.

#### Test Cases

* Default templates exist after workspace setup.
* User creates page from ADR template.
* Admin edits template.

---

# 18. Product Area: Diagrams and Visual Documentation

## 18.1 Product Area Overview

Diagrams help users explain systems, workflows, processes, architectures, and relationships visually inside documentation.

## 18.2 Epic: Diagram Blocks

### Feature 18.2.1: Mermaid, Draw.io and Excalidraw Support

#### Use Cases

* Engineer documents system architecture with Mermaid.
* Product manager creates process diagram with Draw.io.
* Designer creates quick sketch with Excalidraw.
* DevOps documents deployment flow.

#### User Stories

* As an engineer, I want Mermaid diagrams so that diagrams can be maintained as code.
* As a product manager, I want visual diagrams so that workflows are easier to understand.
* As a reader, I want diagrams embedded in pages so that documentation is more understandable.

#### Acceptance Criteria

* Users can insert supported diagram blocks.
* Diagrams render inside pages.
* Users can edit diagrams.
* Diagrams are included in exports where possible.
* Invalid diagrams show helpful errors.

#### Functional Requirements

* Insert Mermaid block.
* Insert Draw.io block.
* Insert Excalidraw block.
* Edit diagram.
* Preview diagram.
* Export diagram.
* Version diagram with page history.
* AI-generate diagram from text, future.

#### UX/UI Requirements

* Diagram block should have edit and preview mode.
* Invalid syntax should not break page rendering.
* Diagrams should be responsive.

#### Technical Notes

* Store diagram data as page content or attachment-backed data.
* Export service may render diagrams as images for PDF/HTML.

#### Test Cases

* Insert Mermaid diagram.
* Edit Mermaid code.
* Insert Draw.io diagram.
* Export page with diagram.
* Invalid Mermaid shows error.

---

# 19. Product Area: Version History and Content Lifecycle

## 19.1 Product Area Overview

Version History and Content Lifecycle allow teams to track changes, recover mistakes, compare document versions, archive old content, and manage deleted content safely.

## 19.2 Epic: Version History

### Feature 19.2.1: Page Version History and Restore

#### Use Cases

* Editor accidentally deletes content and restores previous version.
* Compliance team reviews how a policy changed.
* Knowledge owner compares current version with previous version.

#### User Stories

* As an editor, I want version history so that I can recover mistakes.
* As a knowledge owner, I want to compare versions so that I understand changes.
* As an admin, I want restore actions audited so that history remains traceable.

#### Acceptance Criteria

* Page versions are created after meaningful edits.
* Users with permission can view version history.
* Users can restore a previous version.
* Restore creates a new version.
* Version history shows editor and timestamp.

#### Functional Requirements

* List versions.
* View version snapshot.
* Compare versions.
* Restore version.
* Show editor.
* Show timestamp.
* Track title/content changes.
* Audit restore.

#### UX/UI Requirements

* Version history panel accessible from page menu.
* Diff view should show additions/removals clearly.
* Restore requires confirmation.

#### Technical Notes

* Store snapshots, deltas, or Yjs snapshots.
* Restoring should not delete historical versions.

#### Test Cases

* Edit page creates version.
* Restore previous version.
* Compare two versions.
* Unauthorized user cannot view history.
* Restore event is audited.

---

## 19.3 Epic: Trash and Archive

### Feature 19.3.1: Trash, Restore and Permanent Delete

#### Use Cases

* User deletes an obsolete page.
* Admin restores a mistakenly deleted page.
* Retention policy permanently deletes old trashed pages.

#### User Stories

* As an editor, I want deleted pages to go to trash so that mistakes can be recovered.
* As an admin, I want permanent delete so that sensitive content can be removed.
* As a compliance owner, I want trash retention so that old deleted content is cleaned.

#### Acceptance Criteria

* Deleted pages move to trash.
* Authorized users can restore pages.
* Authorized users can permanently delete pages.
* Retention job deletes old trashed pages.

#### Functional Requirements

* Move page to trash.
* Restore page.
* Permanently delete page.
* List trashed pages.
* Apply retention policy.
* Audit delete/restore/permanent delete.

#### UX/UI Requirements

* Trash view in space or admin settings.
* Restore action should be easy.
* Permanent delete requires strong confirmation.

#### Technical Notes

* Soft delete should preserve enough metadata to restore hierarchy.
* Permanent delete should clean related indexes and attachments according to policy.

#### Test Cases

* Delete page moves to trash.
* Restore page returns it to tree.
* Permanent delete removes page.
* Retention cleanup deletes old trashed page.

---

# 20. Product Area: Admin Dashboard and Analytics

## 20.1 Product Area Overview

Admin Dashboard and Analytics provide visibility into workspace adoption, content quality, search behavior, AI usage, security risks, and documentation health.

## 20.2 Epic: Workspace Analytics Dashboard

### Feature 20.2.1: Admin Dashboard

#### Use Cases

* Admin checks workspace adoption.
* Knowledge manager checks outdated pages.
* Security owner checks public links and risky settings.
* Finance owner checks AI usage and storage usage.

#### User Stories

* As an admin, I want a dashboard so that I can understand workspace activity.
* As a knowledge manager, I want to see outdated pages so that I can improve documentation.
* As a security owner, I want to see risk indicators so that I can act quickly.

#### Acceptance Criteria

* Admin dashboard shows key metrics.
* Metrics are permission-protected.
* Metrics link to detailed filtered views.
* Expensive metrics are precomputed where needed.

#### Functional Requirements

Dashboard metrics:

* Total users.
* Active users.
* Total spaces.
* Total pages.
* Pages created this month.
* Pages updated this month.
* Outdated pages.
* Pages without owners.
* Verified pages.
* Expired pages.
* Public links.
* Guest users.
* Failed searches.
* AI questions.
* Storage usage.
* API key count.
* Pending reviews.

#### UX/UI Requirements

* Use metric cards.
* Use warning indicators.
* Use trend charts.
* Provide drill-down links.

#### Technical Notes

* Use scheduled jobs for heavy calculations.
* Store historical metrics for trends.

#### Test Cases

* Admin views dashboard.
* Non-admin blocked.
* Metric counts match database.
* Drill-down opens filtered view.

---

## 20.3 Epic: Page and Space Analytics

### Feature 20.3.1: Content Analytics

#### Use Cases

* Documentation owner sees which pages are most viewed.
* Knowledge manager finds pages with many unresolved comments.
* Product manager sees public docs traffic.

#### User Stories

* As a page owner, I want page analytics so that I know whether documentation is useful.
* As a space admin, I want space analytics so that I can improve documentation quality.

#### Acceptance Criteria

* Page analytics show views, viewers, comments, and source usage.
* Space analytics aggregate page-level activity.
* Analytics respect permissions.

#### Functional Requirements

Page analytics:

* Views.
* Unique viewers.
* Last viewed.
* Last edited.
* Average read time.
* Comments count.
* Unresolved comments.
* AI citations count.
* Search queries leading to page.

Space analytics:

* Total pages.
* Active contributors.
* Outdated pages.
* Top viewed pages.
* Top edited pages.
* Failed searches.
* Knowledge gaps.

#### UX/UI Requirements

* Page analytics panel should be simple and contextual.
* Space analytics should include tables and charts.

#### Technical Notes

* Track analytics in privacy-conscious way.
* Allow analytics disabling for sensitive deployments.

#### Test Cases

* Page view increments analytics.
* Space analytics aggregate page views.
* Unauthorized user cannot view analytics.

---

# 21. Product Area: Documentation Health Center

## 21.1 Product Area Overview

Documentation Health Center is a strategic innovation module. It measures documentation reliability and guides teams to improve knowledge quality.

## 21.2 Epic: Documentation Health Score

### Feature 21.2.1: Workspace, Space and Page Health Score

#### Use Cases

* Knowledge manager checks which spaces are weak.
* Admin tracks documentation maturity.
* Team lead receives actions to improve team docs.

#### User Stories

* As a knowledge manager, I want a health score so that I can measure documentation quality.
* As a team lead, I want recommendations so that my team knows what to fix.
* As an executive, I want visibility into knowledge risk so that operational risk is reduced.

#### Acceptance Criteria

* Health score exists at page, space, and workspace level.
* Score explains contributing factors.
* Recommendations are actionable.
* Score is updated periodically.

#### Functional Requirements

Score factors:

* Freshness.
* Ownership.
* Verification status.
* Completeness.
* Search success.
* Broken links.
* Duplicate content.
* Unresolved comments.
* AI trust level.
* Public feedback.

Recommended actions:

* Assign owner.
* Request review.
* Update outdated page.
* Merge duplicate page.
* Fix broken links.
* Create missing page.
* Verify critical page.

#### UX/UI Requirements

* Health score card with clear color/severity.
* Breakdown by factor.
* Filter by space, owner, severity, status.
* One-click actions where possible.

#### Technical Notes

* Compute score asynchronously.
* Store historical scores for trends.
* Use page metadata, search logs, comments, verification, and AI feedback.

#### Test Cases

* Page without owner lowers score.
* Verified recent page has high score.
* Expired page lowers score.
* Fixing broken links improves score.

---

## 21.3 Epic: Knowledge Gap Detection

### Feature 21.3.1: AI Knowledge Gap Detection

#### Use Cases

* Users search for a topic and find no results.
* AI gives low-confidence answers.
* Many comments ask the same question.
* Critical process has no runbook.

#### User Stories

* As a knowledge manager, I want to detect missing documentation so that we improve coverage.
* As a team lead, I want suggested page topics so that my team knows what to document.
* As an admin, I want failed searches grouped into themes so that gaps are clear.

#### Acceptance Criteria

* System identifies gaps using multiple signals.
* Gaps are grouped and prioritized.
* Users can create a page from a gap.
* Users can ignore or assign gaps.

#### Functional Requirements

Detect:

* Failed searches.
* AI low-confidence answers.
* Repeated unanswered comments.
* Outdated pages.
* Duplicate content.
* Contradictory content.
* Pages without owners.
* Missing runbooks.
* Missing onboarding guides.

Actions:

* Create page.
* Assign owner.
* Assign reviewer.
* Ignore gap.
* Merge duplicates.
* Archive obsolete page.

#### UX/UI Requirements

* Gap dashboard with severity levels.
* Show evidence for each gap.
* Provide recommended template.
* Allow bulk assignment.

#### Technical Notes

* Use embeddings and clustering for duplicate/gap grouping.
* Use background jobs for analysis.
* Avoid exposing restricted content in gap results.

#### Test Cases

* Failed search creates gap signal.
* Duplicate pages are detected.
* User creates page from gap.
* Ignored gap is hidden.

---

# 22. Product Area: Integrations and Automation

## 22.1 Product Area Overview

Integrations connect ConqrAI Wiki to the broader work ecosystem: project management, communication, source code, storage, monitoring, automation, and AI tools.

## 22.2 Epic: Productivity Integrations

### Feature 22.2.1: Jira, Slack, Teams and Notification Integrations

#### Use Cases

* Create Jira ticket from comment.
* Notify Slack channel when page is updated.
* Send Teams notification for review request.
* Link project documentation to Jira issue.

#### User Stories

* As a product manager, I want to link pages to Jira issues so that documentation and delivery stay connected.
* As a team lead, I want Slack notifications so that updates are visible to the team.
* As a reviewer, I want Teams notifications when approval is requested.

#### Acceptance Criteria

* Admin can configure integrations.
* Users can trigger supported integration actions.
* Integration actions respect permissions.
* Failures are visible and retryable where possible.

#### Functional Requirements

* Jira issue linking.
* Create Jira issue from comment/task.
* Slack notifications.
* Teams notifications.
* Webhook notifications.
* Integration settings.
* Integration audit events.

#### UX/UI Requirements

* Integration settings page with connection status.
* In-page link previews for Jira/Linear/etc.
* Clear error messages for failed integration actions.

#### Technical Notes

* Store integration tokens securely.
* Use background jobs for outbound notifications.
* Support webhooks for extensibility.

#### Test Cases

* Connect Slack.
* Send notification on page update.
* Create Jira ticket from comment.
* Integration failure is logged.

---

## 22.3 Epic: Developer Integrations

### Feature 22.3.1: GitHub, GitLab, Bitbucket and OpenAPI Integration

#### Use Cases

* Sync Markdown docs from repository.
* Generate API docs from OpenAPI spec.
* Link ADR to commit or pull request.
* Suggest docs updates when code changes.

#### User Stories

* As an engineer, I want repository docs synced so that code and documentation stay aligned.
* As a developer, I want OpenAPI import so that API docs are generated automatically.
* As a tech lead, I want pages linked to PRs so that decisions remain traceable.

#### Acceptance Criteria

* Admin can connect source control provider.
* Users can import/sync docs where authorized.
* OpenAPI files generate structured API documentation.
* Sync conflicts are handled clearly.

#### Functional Requirements

* Connect GitHub/GitLab/Bitbucket.
* Import README/docs folder.
* Sync Markdown files.
* Link page to repo/branch/path.
* Import OpenAPI spec.
* Generate API endpoint pages.
* Show sync status.
* Manual sync trigger.

#### UX/UI Requirements

* Repository picker.
* Branch/path selection.
* Sync preview.
* Conflict resolution UI.

#### Technical Notes

* Use provider APIs or Git clone strategy.
* Store provider credentials securely.
* Sync jobs should run in background.

#### Test Cases

* Connect GitHub repo.
* Import Markdown docs.
* Update repo doc and sync changes.
* Import OpenAPI spec.

---

## 22.4 Epic: Automation and Webhooks

### Feature 22.4.1: Webhooks and Automation API

#### Use Cases

* Notify internal system when page is verified.
* Trigger workflow when public link is created.
* Update docs from CI/CD pipeline.

#### User Stories

* As a developer, I want webhooks so that external systems can react to wiki events.
* As an admin, I want to manage webhook secrets so that integrations are secure.

#### Acceptance Criteria

* Admin can create webhook endpoints.
* Selected events trigger webhooks.
* Webhook payloads are signed.
* Failed deliveries are retried.

#### Functional Requirements

* Create webhook.
* Select events.
* Set endpoint URL.
* Generate signing secret.
* Retry failed delivery.
* View delivery logs.
* Disable webhook.

#### UX/UI Requirements

* Webhook setup page.
* Event selector.
* Delivery history table.
* Retry button.

#### Technical Notes

* Sign payloads with HMAC.
* Use queue for delivery.
* Rate-limit and validate URLs.

#### Test Cases

* Create webhook.
* Trigger page updated event.
* Verify signed payload.
* Failed delivery retries.

---

# 23. Product Area: Billing, Licensing and Feature Gating

## 23.1 Product Area Overview

Billing, Licensing and Feature Gating control product monetization, paid plans, enterprise licensing, cloud vs self-hosted behavior, and user-facing upgrade paths.

## 23.2 Epic: Feature Gating

### Feature 23.2.1: Entitlements and Plan-Based Access

#### Use Cases

* Free workspace tries to use Enterprise AI feature.
* Business customer activates paid license.
* Cloud customer upgrades plan.
* Self-hosted customer enters license key.

#### User Stories

* As a product owner, I want paid features gated so that plans are enforceable.
* As an admin, I want to see which features are included in my plan.
* As a user, I want clear upgrade messaging when I hit a locked feature.

#### Acceptance Criteria

* Server checks feature availability.
* Frontend displays locked states.
* Entitlements include tier and feature list.
* Self-hosted license and cloud plan logic are supported.

#### Functional Requirements

* Define feature constants.
* Resolve tier.
* Resolve enabled features.
* Check feature server-side.
* Check feature client-side.
* Return entitlements endpoint.
* Show upgrade labels.
* Fallback to free tier.

#### UX/UI Requirements

* Locked features should show plan badge.
* Upgrade CTA should explain required plan.
* Settings pages should show unavailable features without feeling broken.

#### Technical Notes

* Server-side gating is mandatory.
* Client entitlements improve UX only.
* Cloud can use billing plan registry.
* Self-hosted can use license key service.

#### Test Cases

* Free tier blocked from Business feature.
* Business tier blocked from Enterprise feature.
* Enterprise tier allowed.
* Client lock matches server response.

---

## 23.3 Epic: Plans and Licensing

### Feature 23.3.1: Community, Business and Enterprise Plans

#### Use Cases

* Small team uses free community plan.
* Company buys Business self-managed license.
* Large organization buys Enterprise with compliance features.

#### User Stories

* As a small team, I want Community plan so that I can start free.
* As a company, I want Business features so that I can use SSO, AI, imports, and sharing controls.
* As an enterprise, I want advanced compliance and support.

#### Acceptance Criteria

* Pricing matrix is clear.
* License status is visible.
* Expired license falls back or locks paid features according to policy.
* Plan changes update entitlements.

#### Functional Requirements

Community:

* Pages.
* Rich editor.
* Realtime collaboration.
* Spaces.
* Groups.
* Comments.
* Basic search.
* Diagrams.
* Markdown/HTML import/export.
* Self-hosting.

Business:

* SSO.
* MFA.
* API keys.
* Templates.
* Comment resolution.
* Public sharing controls.
* PDF export.
* DOCX/Notion/Confluence import.
* Typesense.
* Attachment indexing.
* AI Search.
* AI Assistant.
* MCP.
* Air-gapped deployment.

Enterprise:

* SCIM.
* Audit logs.
* Retention controls.
* Page verification.
* Advanced security controls.
* Documentation health center.
* Knowledge gap detection.
* Advanced AI governance.
* Priority support.

#### UX/UI Requirements

* License page for self-hosted.
* Billing page for cloud.
* Plan comparison table.
* Expiration warnings.

#### Technical Notes

* License validation should be robust and secure.
* Do not trust client-side plan state.

#### Test Cases

* Activate license.
* Remove license.
* Expired license behavior.
* Plan upgrade unlocks features.

---

# 24. Product Area: Deployment, Infrastructure and Operations

## 24.1 Product Area Overview

Deployment, Infrastructure and Operations define how ConqrAI Wiki runs in development, self-hosted, air-gapped, and cloud environments. This includes environment configuration, database migrations, queues, storage, email, search, PDF export, collaboration server, observability, and operational health.

## 24.2 Epic: Self-Hosted Deployment

### Feature 24.2.1: Standard Self-Hosted Installation

#### Use Cases

* Company deploys ConqrAI Wiki on its own infrastructure.
* Developer runs local environment with PostgreSQL and Redis.
* Admin configures storage, mail, search, and PDF export.

#### User Stories

* As a DevOps engineer, I want clear deployment commands so that installation is predictable.
* As a self-hosted admin, I want environment validation so that misconfiguration is detected early.
* As a security-conscious company, I want data to stay in my infrastructure.

#### Acceptance Criteria

* App runs with PostgreSQL and Redis.
* Environment variables are documented.
* Migrations can be executed safely.
* Optional services show clear health state.

#### Functional Requirements

* Docker Compose for db/redis.
* Environment configuration.
* Database migrations.
* Local storage.
* S3 storage.
* SMTP/Postmark mail.
* Typesense optional.
* Gotenberg optional.
* Collaboration server.
* Health checks.

#### UX/UI Requirements

* System health page should show status of database, Redis, storage, mail, search, PDF, and queues.
* Missing optional service should show warning, not crash core app.

#### Technical Notes

* Required env vars: APP_URL, APP_SECRET, DATABASE_URL, REDIS_URL.
* APP_SECRET must be strong.
* Run migrations before production deployment.

#### Test Cases

* Fresh install starts successfully.
* Migration runs successfully.
* Missing Redis shows health error.
* Local storage upload works.
* PDF export works when Gotenberg configured.

---

## 24.3 Epic: Air-Gapped Deployment

### Feature 24.3.1: Offline Enterprise Deployment

#### Use Cases

* Aerospace company deploys without internet.
* Government or industrial customer runs in isolated network.
* Enterprise uses local AI and local storage only.

#### User Stories

* As a security owner, I want air-gapped deployment so that no external network is required.
* As an admin, I want local services for storage, mail, search, and AI so that the system works offline.

#### Acceptance Criteria

* Core product works without internet.
* External calls can be disabled.
* Local storage and local providers are supported.
* License behavior works offline according to policy.

#### Functional Requirements

* No external telemetry requirement.
* Local file storage.
* Local SMTP relay.
* Local search.
* Local AI provider, optional.
* Offline license validation.
* Disable external embeds, optional.

#### UX/UI Requirements

* Air-gapped mode should clearly show which integrations are unavailable.
* Settings should avoid suggesting unavailable cloud-only features.

#### Technical Notes

* Avoid hard dependencies on external APIs.
* Package assets locally.
* Provide deployment documentation.

#### Test Cases

* App works without internet.
* External AI provider disabled.
* Local search works.
* Local storage works.

---

## 24.4 Epic: Background Jobs and Queues

### Feature 24.4.1: Queue-Based Processing

#### Use Cases

* Import large Confluence ZIP.
* Generate PDF export.
* Send notifications.
* Re-index search.
* Run audit cleanup.
* Calculate documentation health.

#### User Stories

* As a user, I want long-running tasks to continue in background so that the app remains responsive.
* As an admin, I want to see failed jobs so that operations can be fixed.

#### Acceptance Criteria

* Long tasks run in queues.
* Failed jobs can be retried.
* Users receive status updates.
* Admin can monitor queue health.

#### Functional Requirements

Queues:

* Email queue.
* File import queue.
* Notification queue.
* Audit queue.
* AI queue.
* Search indexing queue.
* General export queue.
* Billing queue.
* Health analysis queue.

#### UX/UI Requirements

* Long-running user jobs should show progress.
* Admin health page should show queue status.
* Failed jobs should show actionable error messages.

#### Technical Notes

* Use BullMQ with Redis.
* Jobs should be idempotent where possible.
* Store job records for user-facing progress.

#### Test Cases

* Import job runs in queue.
* Failed job retries.
* PDF export job completes.
* Queue health shows failed job.

---

## 24.5 Epic: Observability and System Health

### Feature 24.5.1: Operational Health Monitoring

#### Use Cases

* Admin checks why emails are not sending.
* DevOps checks search indexing failures.
* Support investigates AI errors.

#### User Stories

* As a self-hosted admin, I want system health checks so that I can troubleshoot issues.
* As a support engineer, I want logs and job status so that failures are diagnosable.

#### Acceptance Criteria

* System health page shows status of major services.
* Errors are logged.
* Queue failures are visible.
* Admin can identify missing configuration.

#### Functional Requirements

Health checks:

* Database.
* Redis.
* Storage.
* Mail.
* Search.
* PDF service.
* Collaboration server.
* AI provider.
* Queue workers.

Observability:

* Error logs.
* Job logs.
* AI usage logs.
* Search no-result logs.
* Collaboration errors.

#### UX/UI Requirements

* Use status badges: healthy, degraded, unavailable.
* Provide troubleshooting hints.
* Avoid exposing secrets.

#### Technical Notes

* Health endpoints should be protected where sensitive.
* Logs should redact tokens and secrets.

#### Test Cases

* Healthy services show green status.
* Missing mail config shows warning.
* Broken Redis shows error.
* Logs redact secrets.

---

# 25. Global Non-Functional Requirements

## 25.1 Security

* Every protected API must require authentication.
* Authorization must run on the server.
* Search, AI, export, MCP, public sharing, and notifications must be permission-aware.
* Secrets must be encrypted or hashed where appropriate.
* Public routes must not expose internal metadata.

## 25.2 Performance

* Page loads must remain fast for normal documents.
* Search should respond quickly.
* Large imports, exports, indexing, AI operations, and analytics should run in queues.
* Real-time collaboration must remain stable with multiple users.

## 25.3 Reliability

* Autosave should prevent data loss.
* Background jobs should be retryable.
* Collaboration reconnect should be robust.
* Migrations should be safe and tested.

## 25.4 Scalability

* Support many workspaces, spaces, pages, comments, users, and attachments.
* Search indexing should scale independently.
* Collaboration server can run standalone.
* Queues should isolate heavy tasks.

## 25.5 Accessibility

* Public and internal pages should be keyboard navigable.
* Forms should have labels.
* Color indicators should not be the only meaning carrier.
* Public docs should be mobile-friendly.

---

# 26. Global Test Strategy

## 26.1 Unit Tests

* Permission services.
* Feature gating.
* Page services.
* Space services.
* Import/export utilities.
* AI tool permission checks.
* Verification state transitions.
* Public share validation.

## 26.2 Integration Tests

* Auth flows.
* SSO configuration.
* MFA setup.
* Page CRUD.
* Comments.
* Search indexing.
* Public sharing.
* Import/export jobs.
* API key authentication.

## 26.3 End-to-End Tests

* User creates workspace, space, and page.
* Users collaborate in real time.
* User comments and resolves comment.
* Admin restricts page.
* Public link created and revoked.
* AI answer returns citations.
* Page review workflow completes.
* Import and export complete successfully.

## 26.4 Security Tests

* Unauthorized access blocked.
* Restricted pages hidden from search.
* AI cannot access restricted pages.
* Export excludes inaccessible pages.
* Public route does not expose internal metadata.
* API key cannot bypass permissions.
* MCP tools cannot bypass permissions.

---

# 27. Recommended Roadmap

## 27.1 MVP

* Workspace setup.
* Spaces.
* Pages.
* Rich editor.
* Page tree.
* Real-time collaboration.
* Comments.
* Full-text search.
* Basic templates.
* Basic permissions.
* Public page sharing.
* Markdown/HTML import/export.
* AI Assistant.
* AI Search with citations.

## 27.2 Business Version

* SSO.
* MFA.
* API keys.
* Page-level permissions.
* Comment resolution.
* Public sharing controls.
* Public docs portal.
* PDF export.
* DOCX import.
* Confluence import.
* Attachment indexing.
* Typesense search.
* MCP.
* Admin dashboard.

## 27.3 Enterprise Version

* SCIM.
* Audit logs.
* Retention controls.
* Page verification/QMS workflow.
* Guest users.
* Custom domains.
* Public AI Search.
* AI Chat.
* Documentation Health Center.
* Knowledge Gap Detection.
* Human-in-the-loop expert insights.
* Advanced AI governance.
* Air-gapped deployment.

---

# 28. Final Product Positioning

ConqrAI Wiki is not only a documentation tool. It is an enterprise knowledge operating system.

It helps organizations:

* Create knowledge.
* Structure knowledge.
* Search knowledge.
* Share knowledge.
* Govern knowledge.
* Verify knowledge.
* Improve knowledge.
* Use AI safely over knowledge.

The strongest differentiation is the combination of:

1. Real-time collaborative wiki.
2. AI Search and AI Chat with citations.
3. Human-in-the-loop expert validation.
4. Enterprise permissions and compliance.
5. Documentation Health Center.
6. Public and private documentation in one governed platform.

Final positioning statement:

> ConqrAI Wiki is an AI-powered collaborative documentation and knowledge governance platform that helps organizations turn internal expertise, technical documentation, policies, and operational processes into trusted, searchable, verified, and continuously improved knowledge systems.

# ConqrAI Wiki — Detailed Continuation from 22.3 to the End

## Scope

This document continues the product documentation from:

**22.3 Epic: Developer Integrations — Feature 22.3.1: GitHub, GitLab, Bitbucket and OpenAPI Integration**

It follows the structure:

**Epic → Feature → Use Cases → User Stories → Acceptance Criteria → Functional Requirements → UX/UI Requirements → Technical Notes → Test Cases**

---

# 22.3 Epic: Developer Integrations

Developer integrations connect ConqrAI Wiki with engineering systems such as GitHub, GitLab, Bitbucket, OpenAPI specifications, CI/CD pipelines, source-code repositories, issue trackers, and developer automation workflows.

The strategic goal is to reduce the gap between code and documentation. Technical documentation should not become outdated because engineers forgot to update a wiki page. ConqrAI Wiki should help teams import, sync, generate, validate, and maintain technical documentation directly from developer workflows.

---

## Feature 22.3.1: GitHub, GitLab, Bitbucket and OpenAPI Integration

### Use Cases

* Engineering team imports Markdown documentation from a GitHub repository.
* API team imports an OpenAPI specification and generates endpoint documentation pages.
* DevOps team links deployment runbooks to repository files.
* Tech lead links an ADR page to a pull request or commit.
* Documentation owner detects outdated docs after repository changes.
* CI/CD pipeline updates release notes automatically.
* Product team links a feature specification page to the implementation pull request.

### User Stories

* As an engineer, I want to sync repository documentation so that docs and code stay aligned.
* As a tech lead, I want to link pages to repositories, branches, files, commits, and pull requests so that technical decisions are traceable.
* As a developer, I want to import OpenAPI specs so that API documentation is generated automatically.
* As a DevOps engineer, I want CI/CD to update release notes and deployment documentation automatically.
* As a documentation owner, I want sync conflicts to be visible so that I can resolve them safely.
* As an admin, I want repository integrations to respect permissions so that only authorized users can connect or sync repositories.

### Acceptance Criteria

* Admins can connect GitHub, GitLab, or Bitbucket provider accounts.
* Users with permission can select repository, branch, and documentation path.
* Markdown files can be imported as wiki pages.
* Repository folder hierarchy can map to page hierarchy.
* OpenAPI files can generate structured API documentation.
* Sync jobs show status: pending, running, completed, failed, or conflict.
* Manual sync can be triggered by authorized users.
* Automatic sync can be triggered by webhook or schedule.
* Sync does not overwrite local changes without explicit policy.
* Integration events are logged and auditable.

### Functional Requirements

#### Repository Connection

* Connect GitHub.
* Connect GitLab.
* Connect Bitbucket.
* Store provider configuration securely.
* Select organization/workspace.
* Select repository.
* Select branch.
* Select documentation path.
* Test repository access.
* Disconnect provider.
* Refresh expired credentials.

#### Documentation Import

* Import Markdown files.
* Import README files.
* Import `/docs` folder.
* Preserve folder hierarchy as page tree.
* Convert Markdown into editor-compatible document format.
* Preserve code blocks.
* Preserve tables.
* Preserve images where possible.
* Preserve relative links where possible.
* Attach source repository metadata to imported pages.

#### Documentation Sync

* Manual sync.
* Scheduled sync.
* Webhook-triggered sync.
* Detect changed files.
* Detect deleted files.
* Detect renamed files.
* Detect local edits.
* Detect sync conflicts.
* Show sync status.
* Retry failed sync.
* View sync history.

#### Source Linking

Each synced page should store:

* Provider.
* Repository.
* Branch.
* File path.
* Commit SHA.
* Last synced date.
* Sync status.
* Source URL.
* Sync mode.

#### OpenAPI Import

* Upload OpenAPI JSON/YAML file.
* Import OpenAPI from repository path.
* Import OpenAPI from URL.
* Validate OpenAPI schema.
* Generate API overview page.
* Generate endpoint pages.
* Generate authentication page.
* Generate schema/model pages.
* Group endpoints by tag.
* Re-sync when OpenAPI file changes.

### UX/UI Requirements

#### Integration Settings UI

* Dedicated **Developer Integrations** settings page.
* Provider cards for GitHub, GitLab, and Bitbucket.
* Connection status: connected, disconnected, expired token, error.
* Clear permission explanation before connection.
* Repository picker with search.
* Branch picker.
* Folder/path picker.

#### Sync UI

* Sync status badge on synced pages.
* Page source panel showing repository, branch, file path, and last sync.
* Manual **Sync now** button.
* Conflict warning banner when local and remote changes diverge.
* Sync history table showing time, actor, status, changed files, and errors.

#### OpenAPI UI

* OpenAPI import wizard.
* Preview generated API page structure before creation.
* Show validation errors clearly.
* Endpoint pages should use structured API documentation blocks.

### Technical Notes

* Provider tokens must be encrypted at rest.
* Repository sync should run in background jobs.
* Webhook payloads should be verified using provider signatures.
* Markdown conversion should preserve semantic structure.
* OpenAPI generation should use deterministic slugs to avoid duplicate endpoint pages.
* Sync jobs should be idempotent.
* Local edit conflicts should not silently overwrite user content.
* Repository-linked pages should be permission-aware like normal pages.
* For self-hosted deployments, customers may need to configure OAuth app credentials.

### Test Cases

#### Repository Connection

* Connect GitHub successfully.
* Reject invalid provider credentials.
* Disconnect provider and verify sync stops.
* Expired token shows error state.

#### Markdown Import

* Import README as page.
* Import docs folder as nested page tree.
* Preserve code blocks and tables.
* Convert relative links correctly.
* Fail gracefully on unsupported Markdown content.

#### Sync

* Manual sync updates changed file.
* Deleted remote file marks page as removed or stale according to policy.
* Local edit plus remote edit creates conflict.
* Failed sync can be retried.
* Sync history records result.

#### OpenAPI

* Valid OpenAPI file generates endpoint pages.
* Invalid OpenAPI file shows validation error.
* Updated OpenAPI file updates endpoint docs.
* Generated endpoint page includes method, path, parameters, request body, response examples, and errors.

---

## Feature 22.3.2: Repository-to-Wiki Documentation Sync

### Use Cases

* Engineering wants the `/docs` folder in GitHub to become a wiki space.
* Technical writers want to polish repository docs in ConqrAI Wiki while preserving source links.
* A company wants repository docs to remain read-only in the wiki and always reflect the source repository.
* A platform team wants architecture pages generated from Markdown files in a monorepo.

### User Stories

* As an engineer, I want repository docs synced into ConqrAI Wiki so that non-technical users can read them easily.
* As a documentation owner, I want to choose one-way or two-way sync so that documentation ownership is clear.
* As an admin, I want to prevent accidental overwriting of local wiki content.
* As a technical writer, I want conflicts clearly shown so that I can decide what to keep.

### Acceptance Criteria

* A repository folder can be mapped to a wiki space or parent page.
* Sync mode can be configured.
* Sync preserves hierarchy.
* Local and remote changes are handled according to sync mode.
* Sync conflicts are visible and resolvable.
* Sync history is available.

### Functional Requirements

#### Sync Modes

* **One-way repository to wiki**: repository is the source of truth.
* **One-way wiki to repository**: wiki is the source of truth, advanced.
* **Two-way sync**: both sides can change, conflict resolution required.
* **Manual import only**: no continuous sync.

#### Sync Configuration

* Repository provider.
* Repository.
* Branch.
* Folder path.
* Target space.
* Target parent page.
* Sync mode.
* Conflict policy.
* Sync schedule.
* Webhook enabled/disabled.

#### Conflict Policies

* Preserve local and create conflict copy.
* Overwrite local from repository.
* Keep local and mark remote stale.
* Manual resolution required.

### UX/UI Requirements

* Sync configuration wizard.
* Clear warning about source of truth.
* Conflict resolution screen with side-by-side comparison.
* Sync status visible in page metadata.
* Sync history visible to admins and page managers.

### Technical Notes

* Store source mapping between repository file path and page ID.
* Use commit SHA to detect remote changes.
* Use page version or updated timestamp to detect local changes.
* Avoid two-way sync in MVP unless necessary because conflict resolution is complex.

### Test Cases

* Configure one-way repository-to-wiki sync.
* Remote file update updates page.
* Local edit in repository-source mode creates warning or is overwritten based on policy.
* Conflict is detected and displayed.
* Manual conflict resolution updates sync status.

---

## Feature 22.3.3: OpenAPI Documentation Generator

### Use Cases

* Backend team wants to generate API docs from OpenAPI YAML.
* Developer portal needs always-updated endpoint documentation.
* API consumers need examples, response schemas, and authentication details.
* Product team wants API docs published externally.

### User Stories

* As a backend engineer, I want to import OpenAPI specs so that API docs are generated automatically.
* As a developer using the API, I want endpoint pages with examples so that integration is easier.
* As a documentation owner, I want regenerated docs to preserve manual notes where possible.
* As an admin, I want generated API docs to respect space permissions and public sharing settings.

### Acceptance Criteria

* OpenAPI JSON/YAML can be imported.
* Invalid OpenAPI files show validation errors.
* Endpoints are grouped by tags.
* Endpoint pages include method, path, parameters, request body, response body, errors, and examples.
* Regeneration updates generated sections safely.
* Manual notes are preserved where possible.

### Functional Requirements

* Upload OpenAPI file.
* Import OpenAPI from URL.
* Import OpenAPI from repository.
* Validate spec.
* Generate API overview.
* Generate authentication page.
* Generate endpoint pages.
* Generate schema/model pages.
* Preserve manual custom notes section.
* Re-run generation.
* Compare previous generated docs with new spec.
* Mark removed endpoints as deprecated or deleted according to policy.

### UX/UI Requirements

* OpenAPI import wizard.
* Validation result screen.
* Generated docs preview.
* Endpoint grouping by tag.
* Clear generated vs manually editable sections.
* Warning when regeneration may update existing generated content.

### Technical Notes

* Use deterministic page IDs/slugs based on method and path.
* Generated sections can be marked as managed blocks.
* Manual sections should be outside managed block to avoid overwriting.
* Schema examples can be generated from OpenAPI examples or JSON schema.

### Test Cases

* Import valid OpenAPI YAML.
* Reject invalid OpenAPI file.
* Generate endpoint page for GET `/users`.
* Preserve manual notes after regeneration.
* Deleted endpoint is marked deprecated or removed according to policy.

---

## Feature 22.3.4: Pull Request Documentation Checks

### Use Cases

* Pull request changes API but no documentation is updated.
* Architecture change needs an ADR.
* Release requires changelog update.
* Security-sensitive code change requires runbook update.

### User Stories

* As a tech lead, I want documentation checks on PRs so that code changes do not ship without docs.
* As an engineer, I want suggestions for documentation updates so that I know what to change.
* As a documentation owner, I want PRs linked to docs so that traceability improves.

### Acceptance Criteria

* Integration can inspect changed files or PR metadata.
* System can suggest related docs to update.
* PR can display documentation status.
* Documentation requirement can be advisory or blocking depending on policy.
* Linked documentation pages are visible from the PR context.

### Functional Requirements

* Detect PR changes.
* Map changed code paths to documentation pages.
* Suggest related docs.
* Require documentation update label, optional.
* Require linked wiki page, optional.
* Post PR comment with documentation suggestions.
* Show PR status in linked wiki pages.
* Create documentation task from PR, optional.

### UX/UI Requirements

* Repository integration settings should include documentation check policy.
* PR comments should be concise and helpful.
* Wiki page should show linked PRs.
* Blocking/advisory mode should be clearly explained.

### Technical Notes

* Requires repository provider app/webhook.
* Path-to-doc mapping can be configured manually or inferred.
* Blocking checks require provider status/check API.
* AI can suggest impacted docs based on changed files, symbols, and existing page content.

### Test Cases

* PR changing API path suggests API docs update.
* PR with linked docs passes check.
* PR without docs shows warning.
* Blocking mode creates failed status check.
* Advisory mode only comments without failing build.

---

# 22.4 Epic: Communication and Notification Integrations

Communication integrations connect documentation events to communication tools such as Slack, Microsoft Teams, and email. They ensure that users do not miss mentions, comments, review requests, page verification reminders, import/export completion, or security events.

---

## Feature 22.4.1: Slack Integration

### Use Cases

* Notify engineering channel when a deployment runbook changes.
* Notify product channel when a PRD is approved.
* Send weekly documentation health summary to leadership.
* Allow users to search wiki from Slack.

### User Stories

* As a team lead, I want page updates sent to Slack so that my team stays informed.
* As a reviewer, I want approval requests delivered to Slack so that I respond faster.
* As an employee, I want to search wiki from Slack so that I do not need to switch tools.

### Acceptance Criteria

* Admin can connect Slack workspace.
* Space admins can map spaces to Slack channels.
* Notifications are sent for configured events.
* Slack commands respect user permissions.
* Integration failures are visible.

### Functional Requirements

* Connect Slack OAuth app.
* Select default channel.
* Map space to channel.
* Configure event notifications.
* Send page update notifications.
* Send comment mention notifications.
* Send review request notifications.
* Send verification expiry notifications.
* Support `/conqrai search` command, advanced.
* Support page link unfurling, advanced.

### UX/UI Requirements

* Slack settings page with connection status.
* Event selector checklist.
* Channel picker.
* Test notification button.
* Clear error state if Slack token expires.

### Technical Notes

* Store Slack tokens encrypted.
* Use background jobs for notification delivery.
* Verify Slack request signatures for slash commands.
* Permission-check slash command search results.

### Test Cases

* Connect Slack workspace.
* Send test notification.
* Page update sends Slack message.
* User without permission cannot receive restricted page search result through Slack.
* Expired token shows error state.

---

## Feature 22.4.2: Microsoft Teams Integration

### Use Cases

* Enterprise customer uses Teams for all internal notifications.
* Review requests are sent to department Teams channels.
* Security policy verification expiry appears in compliance channel.

### User Stories

* As an admin, I want Teams integration so that notifications fit our Microsoft environment.
* As a user, I want mentions and review requests in Teams so that I do not miss them.

### Acceptance Criteria

* Admin can configure Teams integration.
* Spaces can map to Teams channels.
* Configured events send Teams messages.
* Failures are logged.

### Functional Requirements

* Connect Teams webhook or Microsoft Graph integration.
* Map spaces to Teams channels.
* Send notifications.
* Send approval cards, advanced.
* Send verification reminders.
* Send weekly summaries.

### UX/UI Requirements

* Teams setup instructions must be clear.
* Provide test message button.
* Show connection health.

### Technical Notes

* Microsoft Graph integration may require tenant admin consent.
* Webhook-based setup is simpler for MVP.
* Delivery should run through notification queue.

### Test Cases

* Configure Teams webhook.
* Send test notification.
* Review request sends Teams message.
* Failed webhook delivery is visible.

---

## Feature 22.4.3: Email Notification Integration

### Use Cases

* User receives mention notification by email.
* Reviewer receives approval request email.
* Guest receives invitation email.
* Admin receives import/export completion email.

### User Stories

* As a user, I want email notifications so that I do not miss important updates.
* As an admin, I want SMTP/Postmark configuration so that emails work in self-hosted environments.
* As a security owner, I want emails to avoid leaking restricted content.

### Acceptance Criteria

* Emails are sent for configured notification events.
* Users can configure email preferences.
* Email delivery failures are logged.
* Self-hosted admins can configure SMTP/Postmark.
* Email links re-check access when opened.

### Functional Requirements

* SMTP configuration.
* Postmark configuration.
* Email templates.
* Email preferences.
* Mention emails.
* Comment reply emails.
* Review workflow emails.
* Invite emails.
* Import/export completion emails.
* Verification expiration emails.

### UX/UI Requirements

* Email templates should be branded.
* Notification preferences should be user-friendly.
* Admin mail settings should include test email action.

### Technical Notes

* Use email queue.
* Avoid sending sensitive page content in email when permissions may change.
* Email links should always re-check access after click.

### Test Cases

* Send invite email.
* Send mention email.
* Email disabled in preferences stops non-critical emails.
* Test email confirms configuration.
* Removed user cannot access content from old email link.

---

# 22.5 Epic: Productivity and Project Management Integrations

---

## Feature 22.5.1: Jira Integration

### Use Cases

* Link product requirements to Jira epics.
* Create Jira issue from an unresolved comment.
* Show related Jira issues on a technical specification page.
* Update documentation status when Jira issue is completed.

### User Stories

* As a product manager, I want to link PRDs to Jira epics so that planning and documentation stay connected.
* As an engineer, I want to create a Jira issue from a comment so that feedback becomes trackable work.
* As a team lead, I want to see related Jira issues on a page so that context is complete.

### Acceptance Criteria

* Admin can connect Jira workspace.
* Users can link Jira issues to pages.
* Users can create Jira issues from comments if authorized.
* Jira issue previews show status, assignee, and priority.
* Permissions are respected.

### Functional Requirements

* Connect Jira.
* Search Jira issues.
* Link issue to page.
* Unlink issue.
* Create issue from comment.
* Display issue preview.
* Show issue status.
* Sync issue status, optional.
* Mention linked pages in Jira, optional.

### UX/UI Requirements

* Jira issue picker in page sidebar.
* Jira preview card with key, title, status, assignee.
* Comment action: “Create Jira issue.”
* Integration settings with connection health.

### Technical Notes

* Store Jira OAuth/token securely.
* Jira webhooks can update issue status.
* Jira permissions are separate from wiki permissions; handle errors clearly.

### Test Cases

* Connect Jira.
* Link page to issue.
* Create Jira issue from comment.
* Jira preview displays correct status.
* Disconnect Jira removes live previews.

---

## Feature 22.5.2: Linear, Asana and Trello Integration

### Use Cases

* Startup uses Linear for engineering work.
* Operations team uses Asana tasks from documentation comments.
* Support team uses Trello board for documentation improvements.

### User Stories

* As a team lead, I want to create tasks from wiki comments so that feedback becomes action.
* As a user, I want task links visible in pages so that work and docs stay connected.

### Acceptance Criteria

* Admin can enable supported task integrations.
* Users can create tasks from comments or selected text.
* Task previews are displayed.
* Task links remain visible on page/comment.

### Functional Requirements

* Connect provider.
* Create task from comment.
* Create task from selected text.
* Link task to page.
* Show task preview.
* Sync task status, optional.

### UX/UI Requirements

* Generic task integration UI where possible.
* Provider-specific labels and icons.
* “Create task” action in comment menu.

### Technical Notes

* Build integration abstraction to reduce duplicate implementation.
* Not all providers need full parity in MVP.

### Test Cases

* Connect Linear.
* Create task from comment.
* Linked task appears on page.
* Task status preview updates where supported.

---

# 22.6 Epic: Storage and Document Source Integrations

---

## Feature 22.6.1: Google Drive and SharePoint Import

### Use Cases

* Company migrates Google Docs into ConqrAI Wiki.
* Enterprise imports SharePoint policies.
* Team links existing Drive files as attachments.

### User Stories

* As an admin, I want to import Google Docs so that existing documentation can move into the wiki.
* As an enterprise admin, I want SharePoint import so that Microsoft documents become governed wiki pages.
* As a user, I want to attach Drive files so that related resources are accessible.

### Acceptance Criteria

* Admin can connect Google Drive or SharePoint.
* Users can select files/folders they are allowed to access.
* Imported documents become wiki pages or attachments.
* Permissions and ownership are handled clearly.

### Functional Requirements

* Connect Google Drive.
* Connect SharePoint.
* Browse folders.
* Select files.
* Import Google Docs as pages.
* Import Word files as pages.
* Import PDFs as attachments.
* Preserve folder hierarchy.
* Sync updates, optional.

### UX/UI Requirements

* File picker UI.
* Import preview.
* Mapping to target space.
* Progress and error report.

### Technical Notes

* Requires OAuth and provider API permissions.
* Content conversion depends on file type.
* Sync permissions from external systems can be complex; avoid promising full parity in MVP.

### Test Cases

* Connect Google Drive.
* Import Google Doc.
* Import folder hierarchy.
* Import SharePoint Word document.
* Failed file appears in report.

---

# 22.7 Epic: Automation, Webhooks and API Integrations

---

## Feature 22.7.1: Webhooks

### Use Cases

* Notify internal system when a page is verified.
* Trigger automation when a public link is created.
* Send event to data warehouse when AI answer receives negative feedback.

### User Stories

* As a developer, I want webhooks so that other systems can react to wiki events.
* As an admin, I want signed webhook payloads so that receivers can verify authenticity.
* As an integration owner, I want delivery logs so that I can debug failures.

### Acceptance Criteria

* Admin can create webhook endpoints.
* Admin can choose event types.
* Payloads are signed.
* Failed deliveries are retried.
* Delivery logs are visible.

### Functional Requirements

* Create webhook.
* Update webhook.
* Disable webhook.
* Delete webhook.
* Select events.
* Generate signing secret.
* Send payload.
* Retry failed delivery.
* View delivery history.
* Rotate secret.

### UX/UI Requirements

* Webhook settings page.
* Event selector grouped by category.
* Delivery history with status, response code, attempt count.
* Copy signing secret once.

### Technical Notes

* Use HMAC signatures.
* Deliver webhooks through queue.
* Add timeout and retry policy.
* Avoid sending sensitive data unnecessarily.

### Test Cases

* Create webhook.
* Trigger page updated event.
* Verify signed payload.
* Failed delivery retries.
* Disabled webhook stops events.

---

## Feature 22.7.2: Automation API

### Use Cases

* CI/CD updates release notes.
* Internal script creates onboarding pages for new teams.
* External system queries verified policies.

### User Stories

* As a developer, I want an API so that I can automate documentation workflows.
* As an admin, I want API access controlled with API keys and scopes.

### Acceptance Criteria

* API keys can authenticate requests.
* API respects permissions.
* Sensitive endpoints require correct scopes.
* API activity is audit logged where required.

### Functional Requirements

* Page CRUD API.
* Space API.
* Search API.
* Comment API.
* Attachment API.
* Template API.
* Verification API.
* Public share API.
* API key scopes, advanced.
* Rate limits.

### UX/UI Requirements

* API docs page.
* API key management UI.
* Copy examples for cURL, JavaScript, and Python.

### Technical Notes

* Use same service-layer authorization as UI.
* Rate-limit by key/workspace.
* Avoid separate permission paths for API.

### Test Cases

* API key creates page with write permission.
* API key cannot read restricted page.
* Revoked API key fails.
* Rate limit works.

---

# 22.8 Epic: Integration Marketplace and Management

---

## Feature 22.8.1: Integration Marketplace

### Use Cases

* Admin browses available integrations.
* User requests an integration.
* Enterprise admin enables only approved integrations.

### User Stories

* As an admin, I want a marketplace so that I can discover integrations.
* As a security owner, I want to control which integrations are allowed.
* As a user, I want to request an integration so that my workflow is supported.

### Acceptance Criteria

* Integrations are listed by category.
* Admin can enable/disable integrations.
* Integration status is visible.
* Locked integrations show plan requirements.

### Functional Requirements

* Integration catalog.
* Categories: Developer, Communication, Productivity, Storage, Automation, AI.
* Enable integration.
* Disable integration.
* Configure integration.
* View connection health.
* View last sync.
* View errors.

### UX/UI Requirements

* Marketplace cards with logo, description, status, plan badge.
* Integration detail page with setup steps.
* Search/filter integrations.

### Technical Notes

* Integrations should be modular.
* Provider credentials should be encrypted.
* Plan gating should apply server-side.

### Test Cases

* Admin views marketplace.
* Enable integration.
* Disable integration.
* Locked integration displays upgrade CTA.

---

## Feature 22.8.2: Integration Security Controls

### Use Cases

* Admin restricts which users can connect integrations.
* Security team reviews connected third-party apps.
* Enterprise disables external integrations in air-gapped mode.

### User Stories

* As a security owner, I want to approve integrations before use so that data exposure is controlled.
* As an admin, I want to revoke integration access quickly.
* As an enterprise customer, I want integrations disabled in isolated environments.

### Acceptance Criteria

* Integration permissions are configurable.
* Connected integrations are visible in admin console.
* Admin can revoke integration tokens.
* Integration events are audited.

### Functional Requirements

* Restrict integration installation to admins.
* Approve/reject integration requests.
* Revoke integration tokens.
* View integration scopes.
* View connected users.
* Audit integration changes.
* Disable external integrations globally.

### UX/UI Requirements

* Integration security dashboard.
* Scope display before connection.
* Strong confirmation before revocation.

### Technical Notes

* Store tokens encrypted.
* Redact tokens from logs.
* Respect air-gapped mode.

### Test Cases

* Member cannot install integration when restricted.
* Admin revokes integration.
* Revoked token stops sync.
* Integration install creates audit event.

---

# 22.9 Global Acceptance Criteria for Integrations

The Integrations and Automation product area is complete when:

* Admins can connect and manage supported integrations.
* Repository documentation can be imported and synced.
* OpenAPI specs generate structured API docs.
* Slack, Teams, and email notifications can be configured.
* Jira/tasks can be linked to pages and comments.
* Webhooks send signed payloads.
* Automation API respects permissions.
* Integration tokens are stored securely.
* Integration activity is auditable.
* Integrations can be disabled in air-gapped or high-security environments.

---

# 22.10 Global Test Suite for Integrations

## Unit Tests

* Provider token encryption/decryption.
* Webhook signature generation.
* OpenAPI parser.
* Markdown converter.
* Integration permission checks.

## Integration Tests

* GitHub connection.
* Repository import.
* OpenAPI import.
* Slack notification.
* Jira issue linking.
* Webhook delivery.

## End-to-End Tests

* Connect GitHub, import docs folder, sync updated file.
* Import OpenAPI and generate endpoint pages.
* Create Jira issue from comment.
* Send Slack notification on page update.
* Create webhook and receive signed event.

## Security Tests

* Restricted page is not exposed through integration.
* Revoked provider token stops access.
* Webhook secret is not exposed after creation.
* API key cannot bypass page permissions.
* Integration disabled globally blocks external calls.

---

# 23. Product Area: Billing, Licensing and Feature Gating

## 23.1 Product Area Overview

Billing, Licensing and Feature Gating control monetization, plan limits, feature access, customer upgrades, self-hosted license activation, cloud subscriptions, trials, and support entitlements.

This area must support two business models:

1. **Cloud mode**: subscription billing, plan-based entitlements, Stripe checkout/portal.
2. **Self-hosted mode**: license-key activation, offline or online license validation, seat limits, expiry, and edition management.

---

# 23.2 Epic: Feature Gating System

## Feature 23.2.1: Server-Side Feature Enforcement

### Use Cases

* Free customer tries to access Enterprise audit logs.
* Business customer tries to use SCIM, which is Enterprise-only.
* Self-hosted customer’s license expires.
* Cloud customer upgrades plan and gets features instantly.

### User Stories

* As a product owner, I want paid features protected so that pricing is enforceable.
* As an admin, I want to know which features my workspace has so that I can plan upgrades.
* As an engineer, I want a centralized feature check so that gating is consistent.

### Acceptance Criteria

* Every paid feature is represented by a feature constant.
* Backend checks feature access before executing gated logic.
* Missing or invalid license falls back to free tier.
* Cloud mode resolves features from plan.
* Self-hosted mode resolves features from license.
* Feature check failures return a clear forbidden response.

### Functional Requirements

* Define feature constants.
* Resolve workspace tier.
* Resolve enabled features.
* Check feature server-side.
* Check feature inside controllers/services.
* Return workspace entitlements.
* Support cloud and self-hosted modes.
* Support free fallback.
* Audit license activation/removal.

### UX/UI Requirements

* Locked backend features should correspond to locked frontend UI.
* Error messages should be clear and non-technical.
* Upgrade CTA should explain required plan.

### Technical Notes

* Never rely only on frontend gating.
* License service should be dynamically loaded if enterprise package exists.
* Plan registry should map tiers to features.
* Entitlements should be cached but refreshed after plan/license changes.

### Test Cases

* Free tier blocked from PDF export.
* Business tier allowed to use SSO.
* Business tier blocked from SCIM.
* Enterprise tier allowed to use audit logs.
* Invalid license falls back to free tier.

---

## Feature 23.2.2: Client-Side Entitlements and Locked States

### Use Cases

* User sees “Upgrade your plan” on unavailable features.
* Self-hosted free user sees “Available with a paid license.”
* Paid self-hosted user missing feature sees “Upgrade your license tier.”

### User Stories

* As a user, I want unavailable features to be clearly marked so that I understand what is locked.
* As an admin, I want upgrade guidance so that I can choose the right plan.
* As a designer, I want consistent locked states so that the product feels polished.

### Acceptance Criteria

* Frontend receives entitlement object.
* Feature hooks/components can check feature availability.
* Locked features show consistent messages.
* UI does not expose functional paid actions when feature is unavailable.

### Functional Requirements

* Entitlements endpoint.
* Entitlements client state.
* Feature-check hook.
* Locked feature badge.
* Upgrade CTA.
* Plan-aware messaging.
* Self-hosted license-aware messaging.

### UX/UI Requirements

* Locked controls should be visible enough to drive upgrades but not block normal workflows.
* Settings pages should show feature availability.
* Use consistent badges: Community, Business, Enterprise.

### Technical Notes

* Client state can use Jotai or equivalent.
* Entitlements should refresh after license activation or billing change.

### Test Cases

* Feature hook returns false for locked feature.
* Locked feature badge appears.
* License activation refreshes entitlements.
* Frontend hidden action is still blocked by backend if manually called.

---

# 23.3 Epic: Plan and Pricing Model

## Feature 23.3.1: Community, Business and Enterprise Plan Matrix

### Use Cases

* Startup uses Community for basic self-hosted wiki.
* Company buys Business for SSO, AI, imports, sharing, and search.
* Large enterprise buys Enterprise for SCIM, audit, retention, and compliance.

### User Stories

* As a prospect, I want a clear feature matrix so that I understand which plan fits.
* As an admin, I want to compare current plan with higher plans so that I can justify upgrade.
* As a sales team, I want Enterprise plan to highlight governance and support.

### Acceptance Criteria

* Plan matrix is grouped by feature categories.
* Each plan clearly shows included and excluded features.
* Pricing page separates self-managed and cloud where needed.
* Enterprise plan supports custom pricing/contact sales.

### Functional Requirements

#### Plan Categories

* Core documentation.
* Collaboration.
* Search.
* AI.
* Security.
* Access and permissions.
* Import/export.
* Admin and compliance.
* Public sharing.
* Support.

#### Community Includes

* Pages.
* Rich editor.
* Realtime collaboration.
* Spaces.
* Groups.
* Comments.
* Page history.
* Diagrams.
* Basic full-text search.
* Markdown/HTML import-export.
* Self-hosting.
* Community support.

#### Business Includes

* SSO.
* MFA.
* API keys.
* Page-level permissions.
* Templates.
* Comment resolution.
* Public sharing controls.
* Remove public branding.
* Typesense search.
* Attachment indexing.
* AI Search.
* AI Assistant.
* MCP.
* Confluence/Notion/DOCX import.
* PDF export.
* Air-gapped deployment.
* Email support.

#### Enterprise Includes

* SCIM.
* Audit logs.
* Retention controls.
* Page verification/QMS.
* Guest users.
* Advanced security controls.
* Documentation Health Center.
* Knowledge Gap Detection.
* Advanced AI governance.
* Custom domains.
* Priority support.

### UX/UI Requirements

* Pricing cards for each plan.
* Feature comparison table.
* FAQ section.
* Self-managed positioning should be clear.
* Enterprise CTA: “Contact sales.”

### Technical Notes

* Pricing table should be driven by feature matrix data.
* Feature matrix should map to actual feature constants to avoid drift.

### Test Cases

* Pricing table renders correct features.
* Business features match entitlement registry.
* Enterprise features match entitlement registry.

---

## Feature 23.3.2: Trial and Upgrade Flow

### Use Cases

* Free user starts Business trial.
* Admin upgrades to Business.
* Enterprise customer requests demo.
* Trial expires and paid features lock.

### User Stories

* As an admin, I want to start a trial so that I can evaluate paid features.
* As a product owner, I want trial conversion paths so that users can upgrade.
* As a user, I want clear trial expiration warnings so that I am not surprised.

### Acceptance Criteria

* Trial can be started by eligible workspace.
* Trial expiration is visible.
* Trial unlocks selected features temporarily.
* Trial expiration locks features or prompts upgrade.
* Upgrade flow updates entitlements.

### Functional Requirements

* Start trial.
* Show trial days remaining.
* Trial expiration warning.
* Upgrade CTA.
* Cancel trial, optional.
* Convert trial to paid plan.
* Lock trial features after expiry.

### UX/UI Requirements

* Trial banner for admins.
* Gentle feature upsell for users.
* Clear expiration state.

### Technical Notes

* Trial state should be stored server-side.
* Prevent repeated abuse of trials.

### Test Cases

* Start trial.
* Trial unlocks features.
* Expired trial locks features.
* Upgrade during trial keeps features active.

---

# 23.4 Epic: Self-Hosted License Management

## Feature 23.4.1: License Activation and Validation

### Use Cases

* Self-hosted customer activates Business license.
* Enterprise customer activates offline license.
* License expires.
* Admin removes license.

### User Stories

* As a self-hosted admin, I want to activate a license key so that paid features are enabled.
* As an enterprise customer, I want offline-friendly licensing so that air-gapped deployment works.
* As an admin, I want to see license details so that I know seats, expiry, and edition.

### Acceptance Criteria

* Admin can activate license.
* License details are displayed.
* Invalid license is rejected.
* Expired license is detected.
* Removing license falls back to free tier.
* License events are audited.

### Functional Requirements

* Activate license.
* Validate license.
* Remove license.
* Show license info.
* Show customer name.
* Show license type.
* Show seat count.
* Show issue date.
* Show expiration date.
* Show trial flag.
* Show enabled features.

### UX/UI Requirements

* Self-hosted **License & Edition** page.
* License activation form.
* License status badge: active, expired, invalid, trial.
* Expiration warning.

### Technical Notes

* License validation should verify signature/format.
* Store license securely.
* Avoid network dependency for air-gapped license if supported.

### Test Cases

* Activate valid license.
* Reject invalid license.
* Expired license locks features.
* Remove license returns to free.
* Audit event created on activation/removal.

---

## Feature 23.4.2: Seat Limits

### Use Cases

* Business license allows 50 users.
* Admin tries to invite 51st user.
* Enterprise license has custom seat count.

### User Stories

* As a product owner, I want seat limits enforced so that licenses are respected.
* As an admin, I want to see used seats so that I can manage users.
* As an admin, I want clear messaging when seat limit is reached.

### Acceptance Criteria

* License seat count is displayed.
* Active users count against seat limit.
* Guest users may count differently depending on plan policy.
* Inviting beyond seat limit is blocked or warned.

### Functional Requirements

* Count active seats.
* Show used/available seats.
* Block invite beyond limit.
* Seat limit warning.
* Deactivated users free seats.
* Guest seat policy.

### UX/UI Requirements

* Members page should show seat usage.
* Invite modal should show seat limit warning.
* Upgrade CTA when limit reached.

### Technical Notes

* Define exactly which users count: active internal users, guests, pending invites.
* Enforce seat limit server-side.

### Test Cases

* Invite user within limit.
* Invite user beyond limit fails.
* Deactivate user frees seat.
* Guest count follows configured policy.

---

# 23.5 Epic: Cloud Billing

## Feature 23.5.1: Stripe Billing and Customer Portal

### Use Cases

* Cloud customer upgrades plan.
* Admin opens billing portal to update payment method.
* Subscription payment fails.
* Customer cancels subscription.

### User Stories

* As a cloud admin, I want checkout so that I can upgrade easily.
* As an owner, I want billing portal so that I can manage invoices and payment methods.
* As a product owner, I want billing status to update entitlements automatically.

### Acceptance Criteria

* Billing plans are listed.
* Checkout session can be created.
* Customer portal can be opened.
* Stripe webhooks update subscription status.
* Entitlements reflect subscription status.

### Functional Requirements

* List billing plans.
* Create checkout session.
* Open billing portal.
* Receive Stripe webhooks.
* Process subscription created/updated/canceled.
* Process payment failed.
* Update workspace plan.
* Show billing info.

### UX/UI Requirements

* Billing page should show current plan, renewal date, seats, and billing status.
* Upgrade buttons should be clear.
* Payment failure banner for owners/admins.

### Technical Notes

* Verify Stripe webhook signatures.
* Billing queue processes webhook events.
* Never trust client-submitted plan changes.

### Test Cases

* Create checkout session.
* Stripe webhook upgrades plan.
* Payment failed state shown.
* Canceled subscription locks paid features after policy period.

---

# 23.6 Epic: Usage Limits and Metering

## Feature 23.6.1: AI, Storage, API and User Usage Tracking

### Use Cases

* Admin sees AI token usage.
* Product owner limits free plan storage.
* API abuse is rate-limited.
* Enterprise wants usage report.

### User Stories

* As an admin, I want usage visibility so that I can manage cost.
* As a product owner, I want plan limits so that resource usage is sustainable.
* As a finance owner, I want AI cost estimates so that budget is controlled.

### Acceptance Criteria

* Usage metrics are tracked by workspace.
* Plan limits are enforced or warned.
* Admin can view usage dashboard.
* Usage data is reasonably accurate.

### Functional Requirements

Track:

* Users/seats.
* Storage usage.
* API calls.
* AI tokens.
* AI requests.
* Public AI requests.
* File imports.
* Exports.
* Search index size.

Limits:

* Seats.
* Storage.
* API rate limit.
* AI monthly budget.
* Attachment size.
* Import file size.

### UX/UI Requirements

* Usage page with charts and limits.
* Warning at 80%, 90%, and 100% usage.
* Upgrade CTA when limit reached.

### Technical Notes

* Usage events can be aggregated daily.
* Real-time hard limits should use current counters.
* AI usage should include model/provider metadata.

### Test Cases

* AI request increments token usage.
* Storage usage updates after upload.
* Limit warning appears at threshold.
* Hard limit blocks action when configured.

---

# 23.7 Global Acceptance Criteria for Billing and Licensing

The Billing, Licensing and Feature Gating area is complete when:

* All paid features are represented by feature constants.
* Server-side checks protect every paid feature.
* Client-side locked states are consistent and clear.
* Cloud billing updates entitlements through Stripe webhooks.
* Self-hosted licenses activate and validate correctly.
* Expired or invalid licenses behave predictably.
* Seat limits and usage limits are visible and enforceable.
* Admins can see current plan, license, features, and usage.
* Upgrade flows are clear.

---

# 23.8 Billing and Licensing Test Suite

## Unit Tests

* Feature registry mapping.
* License validation.
* Seat counting.
* Plan entitlement resolution.
* Usage limit calculation.

## Integration Tests

* License activation.
* License removal.
* Entitlements endpoint.
* Stripe webhook processing.
* Feature-gated endpoint access.

## End-to-End Tests

* Free workspace sees locked Business feature.
* Self-hosted admin activates Business license.
* Business feature becomes available.
* Enterprise-only feature remains locked.
* Cloud admin upgrades plan through checkout.

## Security Tests

* Client-side entitlement manipulation does not unlock backend feature.
* Invalid license cannot unlock features.
* Stripe webhook signature required.
* Non-owner cannot access billing/license admin actions.

---

# 24. Product Area: Deployment, Infrastructure and Operations

## 24.1 Product Area Overview

Deployment, Infrastructure and Operations define how ConqrAI Wiki is installed, configured, scaled, monitored, upgraded, backed up, and maintained in development, self-hosted, air-gapped, and cloud environments.

This area is essential because ConqrAI Wiki targets companies that may run it in their own infrastructure with strict security, compliance, and reliability expectations.

---

# 24.2 Epic: Local Development and Developer Experience

## Feature 24.2.1: Local Development Environment

### Use Cases

* Developer starts the project locally.
* Contributor runs frontend and backend in watch mode.
* Engineer runs migrations and tests.

### User Stories

* As a developer, I want simple commands so that I can start quickly.
* As a backend developer, I want database and Redis via Docker so that infrastructure setup is easy.
* As a frontend developer, I want Vite dev server proxy so that API calls work locally.

### Acceptance Criteria

* `pnpm install` installs dependencies.
* Docker Compose starts PostgreSQL and Redis.
* Environment can be copied from `.env.example`.
* Client runs on Vite.
* Server runs in watch mode.
* Tests and lint commands work.

### Functional Requirements

* pnpm workspaces.
* Nx orchestration.
* Docker Compose for db/redis.
* `.env.example`.
* Client dev command.
* Server dev command.
* Build command.
* Test commands.
* Lint/format commands.
* Migration commands.

### UX/UI Requirements

* Developer README should be clear and copy-paste friendly.
* Errors for missing env vars should be actionable.

### Technical Notes

* Monorepo should keep client, server, shared packages, and EE package organized.
* Vite should proxy `/api`, `/socket.io`, and `/collab` to backend.

### Test Cases

* Fresh clone installs successfully.
* Docker Compose starts db/redis.
* Server starts with valid env.
* Client loads and calls API.
* Unit tests run successfully.

---

# 24.3 Epic: Self-Hosted Deployment

## Feature 24.3.1: Standard Self-Hosted Installation

### Use Cases

* Company deploys ConqrAI Wiki on a private server.
* Startup deploys on VPS.
* Enterprise deploys in Kubernetes.
* Customer uses S3-compatible storage and SMTP.

### User Stories

* As a DevOps engineer, I want clear deployment documentation so that installation is predictable.
* As a self-hosted admin, I want configuration validation so that misconfiguration is detected early.
* As a security owner, I want company data to remain in our infrastructure.

### Acceptance Criteria

* Application runs with PostgreSQL and Redis.
* Required environment variables are documented.
* Migrations run before production.
* Optional services can be configured.
* Health checks show service status.

### Functional Requirements

Required services:

* PostgreSQL.
* Redis.
* Server app.
* Client app or static frontend.
* Collaboration server.

Optional services:

* S3-compatible storage.
* SMTP/Postmark mail.
* Typesense search.
* Gotenberg PDF export.
* Local or external AI provider.

Configuration:

* APP_URL.
* APP_SECRET.
* DATABASE_URL.
* REDIS_URL.
* STORAGE_DRIVER.
* MAIL_DRIVER.
* Search configuration.
* PDF service configuration.
* AI provider configuration.

### UX/UI Requirements

* System health page shows configured services.
* Missing optional services show warnings instead of breaking app.
* Admin settings should show which features require missing services.

### Technical Notes

* APP_SECRET should be at least 32 characters.
* Use environment validation at startup.
* Migrations should be run as a separate step or startup job depending on deployment policy.

### Test Cases

* Deploy with local storage.
* Deploy with S3 storage.
* SMTP test email succeeds.
* Missing Gotenberg disables PDF export with clear message.
* Typesense configured enables advanced search.

---

## Feature 24.3.2: Docker and Docker Compose Deployment

### Use Cases

* Small company deploys using Docker Compose.
* Developer tests production-like setup locally.
* Self-hosted customer wants simple deployment path.

### User Stories

* As an admin, I want Docker Compose deployment so that setup is easy.
* As a DevOps engineer, I want containers for server, client, database, Redis, and workers.

### Acceptance Criteria

* Docker images can be built.
* Docker Compose can start the full stack.
* Volumes persist data.
* Environment variables configure services.
* Logs are accessible.

### Functional Requirements

* Server Dockerfile.
* Client build/static serving strategy.
* Worker process.
* Collaboration process.
* PostgreSQL service.
* Redis service.
* Optional Typesense.
* Optional Gotenberg.
* Persistent volumes.
* Health checks.

### UX/UI Requirements

* Deployment docs should include example Compose file.
* Troubleshooting section for common errors.
* Startup logs should make missing config easy to detect.

### Technical Notes

* Separate worker process is recommended for queues.
* Collaboration server may run standalone for scaling.
* Use health checks for db, Redis, app, and workers.
* Avoid baking secrets into images.

### Test Cases

* Build Docker images.
* Start full stack with Compose.
* Restart containers and verify data persists.
* Worker processes background job.
* Health checks return expected status.

---

## Feature 24.3.3: Kubernetes Deployment

### Use Cases

* Enterprise deploys ConqrAI Wiki in Kubernetes.
* Customer scales server, workers, and collaboration server independently.
* DevOps team uses Helm or manifests for repeatable deployment.

### User Stories

* As a DevOps engineer, I want Kubernetes deployment so that the platform scales reliably.
* As an enterprise admin, I want separate deployments for web, API, workers, and collaboration so that resources can be tuned independently.

### Acceptance Criteria

* App can run in Kubernetes.
* Server, workers, and collaboration services can be scaled separately.
* ConfigMaps and Secrets configure environment.
* Persistent storage and external database are supported.

### Functional Requirements

* Kubernetes manifests or Helm chart.
* Deployment for server.
* Deployment for worker.
* Deployment for collaboration server.
* Service for API/web.
* Ingress configuration.
* Secrets management.
* ConfigMaps.
* Horizontal scaling.
* Readiness/liveness probes.

### UX/UI Requirements

* Deployment guide should include architecture diagram.
* Provide example values for common configurations.

### Technical Notes

* Collaboration WebSocket routing must be configured correctly in ingress.
* Queue workers should scale based on job load.
* Use external managed PostgreSQL/Redis where preferred.

### Test Cases

* Deploy to Kubernetes test cluster.
* Scale workers.
* WebSocket collaboration works through ingress.
* Readiness probe blocks traffic until ready.

---

# 24.4 Epic: Air-Gapped Deployment

## Feature 24.4.1: Offline Enterprise Deployment

### Use Cases

* Aerospace company deploys without internet.
* Government or industrial customer runs in isolated network.
* Enterprise uses local AI and local storage only.

### User Stories

* As a security owner, I want air-gapped deployment so that no external network is required.
* As an admin, I want local services for storage, mail, search, and AI so that the system works offline.
* As an enterprise customer, I want offline license support so that paid features work in isolated environments.

### Acceptance Criteria

* Core product works without internet.
* External calls can be disabled.
* Local storage and local providers are supported.
* License behavior works offline according to policy.
* Cloud-only features are hidden or disabled.

### Functional Requirements

* No external telemetry requirement.
* Local file storage.
* Local SMTP relay.
* Local search.
* Local AI provider, optional.
* Offline license validation.
* Disable external embeds, optional.
* Local documentation assets.
* Offline upgrade package, optional.

### UX/UI Requirements

* Air-gapped mode should clearly show which integrations are unavailable.
* Settings should avoid suggesting unavailable cloud-only features.
* System health should show offline mode status.

### Technical Notes

* Avoid hard dependencies on external APIs.
* Package assets locally.
* Provide deployment documentation.
* External AI providers should be disabled unless explicitly configured.

### Test Cases

* App works without internet.
* External AI provider disabled.
* Local search works.
* Local storage works.
* Cloud billing page hidden in air-gapped mode.

---

# 24.5 Epic: Background Jobs and Queues

## Feature 24.5.1: Queue-Based Processing

### Use Cases

* Import large Confluence ZIP.
* Generate PDF export.
* Send notifications.
* Re-index search.
* Run audit cleanup.
* Calculate documentation health.

### User Stories

* As a user, I want long-running tasks to continue in the background so that the app remains responsive.
* As an admin, I want to see failed jobs so that operations can be fixed.
* As an engineer, I want retryable jobs so that temporary errors do not lose work.

### Acceptance Criteria

* Long tasks run in queues.
* Failed jobs can be retried.
* Users receive status updates.
* Admin can monitor queue health.
* Jobs are idempotent where possible.

### Functional Requirements

Queues:

* Email queue.
* File import queue.
* Notification queue.
* Audit queue.
* AI queue.
* Search indexing queue.
* General export queue.
* Billing queue.
* Health analysis queue.

Job capabilities:

* Retry failed jobs.
* Track job progress.
* Store job result.
* Store job error.
* Cancel job where safe.
* Admin job monitoring.

### UX/UI Requirements

* Long-running user jobs should show progress.
* Admin health page should show queue status.
* Failed jobs should show actionable error messages.

### Technical Notes

* Use BullMQ with Redis.
* Jobs should be idempotent where possible.
* Store job records for user-facing progress.
* Separate high-cost AI jobs from general jobs.

### Test Cases

* Import job runs in queue.
* Failed job retries.
* PDF export job completes.
* Queue health shows failed job.
* User sees import progress.

---

# 24.6 Epic: Storage and File Infrastructure

## Feature 24.6.1: Local and S3-Compatible Storage

### Use Cases

* Small self-hosted installation stores files locally.
* Enterprise stores attachments in S3-compatible object storage.
* Cloud deployment uses managed object storage.

### User Stories

* As an admin, I want to choose local or S3 storage so that deployment fits our infrastructure.
* As a user, I want uploaded files to be reliably available.
* As a security owner, I want storage access to respect page permissions.

### Acceptance Criteria

* Storage driver can be configured.
* File uploads work with selected driver.
* Attachment downloads are permission-checked.
* Storage failures are reported clearly.

### Functional Requirements

* Local storage driver.
* S3 storage driver.
* File upload.
* File download.
* File delete.
* Signed URLs where needed.
* Attachment metadata.
* Size limits.
* MIME type validation.

### UX/UI Requirements

* File upload progress.
* Clear upload failure messages.
* Admin storage settings show current driver.

### Technical Notes

* Avoid direct public bucket exposure for private files.
* Attachment access must validate page permission.
* Large file uploads may need streaming.

### Test Cases

* Upload file with local storage.
* Upload file with S3 storage.
* Unauthorized user cannot download attachment.
* Oversized file is rejected.

---

# 24.7 Epic: Database and Migrations

## Feature 24.7.1: Database Migrations and Type Generation

### Use Cases

* Developer creates new database migration.
* Admin upgrades self-hosted deployment.
* Engineering regenerates DB types after schema change.

### User Stories

* As a backend engineer, I want migrations so that schema changes are controlled.
* As a self-hosted admin, I want safe upgrade instructions so that data is protected.
* As a developer, I want generated DB types so that queries are type-safe.

### Acceptance Criteria

* Migrations can be created, applied, and rolled back where supported.
* Pending migrations can be run safely.
* DB types can be regenerated.
* Migration failures are visible.

### Functional Requirements

* Create migration.
* Run next migration.
* Run all pending migrations.
* Rollback last migration.
* Regenerate DB types.
* Show migration status, optional.

### UX/UI Requirements

* Admin docs should include upgrade steps.
* Errors should include migration name and failure reason.

### Technical Notes

* Use Kysely migrations.
* Production rollback may require careful policy.
* Back up database before major upgrades.

### Test Cases

* Run migration successfully.
* Rollback migration in dev.
* Regenerate types after schema change.
* Failed migration stops startup or upgrade flow safely.

---

# 24.8 Epic: Observability and System Health

## Feature 24.8.1: Operational Health Monitoring

### Use Cases

* Admin checks why emails are not sending.
* DevOps checks search indexing failures.
* Support investigates AI errors.
* Self-hosted customer checks queue workers.

### User Stories

* As a self-hosted admin, I want system health checks so that I can troubleshoot issues.
* As a support engineer, I want logs and job status so that failures are diagnosable.
* As a DevOps engineer, I want service health endpoints for monitoring.

### Acceptance Criteria

* System health page shows status of major services.
* Errors are logged.
* Queue failures are visible.
* Admin can identify missing configuration.
* Health endpoints are protected where sensitive.

### Functional Requirements

Health checks:

* Database.
* Redis.
* Storage.
* Mail.
* Search.
* PDF service.
* Collaboration server.
* AI provider.
* Queue workers.

Observability:

* Error logs.
* Job logs.
* AI usage logs.
* Search no-result logs.
* Collaboration errors.
* Import/export job errors.

### UX/UI Requirements

* Use status badges: healthy, degraded, unavailable.
* Provide troubleshooting hints.
* Avoid exposing secrets.
* Show last checked time.

### Technical Notes

* Health endpoints should avoid leaking credentials.
* Logs should redact tokens and secrets.
* External monitoring tools can use lightweight health endpoints.

### Test Cases

* Healthy services show green status.
* Missing mail config shows warning.
* Broken Redis shows error.
* Logs redact secrets.
* Health endpoint returns degraded status when optional service fails.

---

# 24.9 Epic: Backup, Restore and Disaster Recovery

## Feature 24.9.1: Backup and Restore Strategy

### Use Cases

* Self-hosted customer needs backup guidance.
* Admin restores after accidental data loss.
* Enterprise requires disaster recovery plan.

### User Stories

* As an admin, I want backup documentation so that we can recover from failure.
* As an enterprise customer, I want restore procedures so that business continuity is protected.
* As a DevOps engineer, I want to know which data must be backed up.

### Acceptance Criteria

* Backup requirements are documented.
* Restore procedure is documented.
* Database and file storage are included.
* Restore process is testable.

### Functional Requirements

Backup scope:

* PostgreSQL database.
* File storage.
* Environment configuration.
* License configuration.
* Search index can be rebuilt.
* Redis queues may be transient depending on policy.

Restore procedure:

* Restore database.
* Restore file storage.
* Restore environment.
* Run migrations if needed.
* Rebuild search index.
* Validate health checks.

### UX/UI Requirements

* Admin docs should include backup checklist.
* System health page can show last backup if integrated with backup system, optional.

### Technical Notes

* Application should provide commands or docs for reindexing search.
* Search index should be treated as rebuildable derived data.
* Backups should be encrypted by customer infrastructure.

### Test Cases

* Restore database backup in staging.
* Restore file storage.
* Rebuild search index.
* Validate pages and attachments after restore.

---

# 24.10 Epic: Upgrade and Release Management

## Feature 24.10.1: Safe Upgrade Process

### Use Cases

* Self-hosted customer upgrades from one version to another.
* Enterprise wants release notes and migration notes.
* Admin wants rollback plan.

### User Stories

* As a self-hosted admin, I want upgrade instructions so that I can update safely.
* As an enterprise customer, I want release notes so that I know what changed.
* As a DevOps engineer, I want migration warnings so that I can prepare.

### Acceptance Criteria

* Release notes are provided.
* Migration steps are documented.
* Breaking changes are highlighted.
* Upgrade process includes backup recommendation.

### Functional Requirements

* Versioned release notes.
* Migration guide.
* Pre-upgrade checklist.
* Post-upgrade validation checklist.
* Rollback guidance.
* Compatibility notes.

### UX/UI Requirements

* Admin system page should show current version.
* Optional update notification for self-hosted if internet is available.

### Technical Notes

* Database migrations should be backward-compatible where possible.
* Major upgrades should document manual actions.

### Test Cases

* Upgrade staging environment.
* Migrations complete successfully.
* Existing pages load after upgrade.
* Feature entitlements remain correct after upgrade.

---

# 24.11 Global Acceptance Criteria for Deployment and Operations

The Deployment, Infrastructure and Operations area is complete when:

* Developers can run the project locally.
* Self-hosted deployment is documented and reliable.
* Docker Compose deployment works.
* Kubernetes deployment is supported or documented.
* Air-gapped deployment works for supported features.
* Background jobs process long tasks reliably.
* Storage drivers work and enforce permissions.
* Migrations are documented and testable.
* System health is visible to admins.
* Backup and restore strategy is documented.


# ConqrAI Wiki — Detailed Product Areas 24 to End

## Document Purpose

This document expands the product specification from **24. Product Area: Deployment, Infrastructure and Operations** until the end of the ConqrAI Wiki product documentation.

It follows this structure:

**Product Area → Epic → Feature → Use Cases → User Stories → Acceptance Criteria → Functional Requirements → UX/UI Requirements → Technical Notes → Test Cases**

---

# 24. Product Area: Deployment, Infrastructure and Operations

## 24.1 Product Area Overview

Deployment, Infrastructure and Operations define how ConqrAI Wiki is installed, configured, scaled, monitored, upgraded, backed up, and maintained across different environments.

ConqrAI Wiki must support multiple deployment models:

1. **Local development** for engineers.
2. **Self-hosted deployment** for companies that want full infrastructure control.
3. **Cloud deployment** for customers who prefer managed hosting.
4. **Air-gapped deployment** for high-security environments.
5. **Enterprise Kubernetes deployment** for large-scale organizations.

This product area is critical because ConqrAI Wiki targets enterprise and self-managed customers. The platform must be reliable, diagnosable, secure, and easy to operate.

---

## 24.2 Epic: Local Development Environment

### Feature 24.2.1: Developer Setup and Local Run

#### Use Cases

* A new engineer clones the monorepo and starts development.
* A backend engineer runs PostgreSQL and Redis locally.
* A frontend engineer runs the Vite client with API proxy.
* A contributor runs tests and lint before opening a pull request.

#### User Stories

* As a developer, I want simple setup commands so that I can start contributing quickly.
* As a backend developer, I want local infrastructure through Docker Compose so that I do not manually install PostgreSQL and Redis.
* As a frontend developer, I want a dev proxy so that client API calls work without complex setup.
* As a maintainer, I want standard test and lint commands so that code quality remains consistent.

#### Acceptance Criteria

* `pnpm install` installs all workspace dependencies.
* Docker Compose starts PostgreSQL and Redis.
* `.env.example` can be copied to `.env`.
* Client starts successfully on Vite dev server.
* Server starts successfully in watch mode.
* Migrations can be run from the server app.
* Tests, linting, and formatting commands work.
* Developer README explains all required commands.

#### Functional Requirements

* pnpm workspace support.
* Nx orchestration.
* Docker Compose for PostgreSQL and Redis.
* `.env.example` with required variables.
* Client dev command.
* Server dev command.
* Full-stack dev command.
* Build commands.
* Unit test commands.
* E2E test commands.
* Lint commands.
* Format commands.
* Migration commands.
* Email template preview command.
* Collaboration server dev command.

#### UX/UI Requirements

* Developer documentation must be copy-paste friendly.
* Startup errors should clearly explain missing environment variables.
* The local app should show a friendly error page if backend is unavailable.
* Dev proxy errors should be visible in browser console and terminal.

#### Technical Notes

* The frontend should proxy `/api`, `/socket.io`, and `/collab` to the backend during development.
* The backend should validate required environment variables at startup.
* Database migrations should be deterministic and safe to run repeatedly when no pending migrations exist.
* Developer setup should not require enterprise modules unless explicitly enabled.

#### Test Cases

* Fresh clone installs dependencies successfully.
* Docker Compose starts PostgreSQL and Redis.
* Server starts with valid `.env`.
* Client loads and calls backend through proxy.
* Missing `DATABASE_URL` shows clear startup error.
* Unit tests run successfully.
* E2E tests connect to test database.

---

### Feature 24.2.2: Monorepo Developer Experience

#### Use Cases

* Developer modifies shared editor extension used by client and server.
* Backend engineer changes API DTO and frontend consumes it.
* Enterprise package is loaded dynamically when available.

#### User Stories

* As a developer, I want clear monorepo boundaries so that I know where each feature belongs.
* As a maintainer, I want shared packages so that duplicated logic is reduced.
* As an enterprise developer, I want enterprise code separated so that licensing boundaries are respected.

#### Acceptance Criteria

* Client, server, shared packages, and enterprise modules are clearly separated.
* Shared editor extensions can be imported by client and server.
* Enterprise modules can be loaded dynamically.
* Path aliases work consistently.
* Build commands work for all apps/packages.

#### Functional Requirements

* `apps/client` for React SPA.
* `apps/server` for NestJS backend.
* `packages/editor-ext` for editor extensions.
* `packages/ee` for enterprise modules.
* TypeScript path aliases.
* Shared lint/format rules.
* Nx build orchestration.
* Package-level test commands.

#### UX/UI Requirements

* Developer docs should include project structure diagram.
* Each package should have ownership and purpose explained.
* New feature guide should explain where frontend/backend/shared code belongs.

#### Technical Notes

* Avoid circular dependencies between apps and packages.
* Keep enterprise-only imports dynamic to avoid breaking community builds.
* Shared types should avoid leaking enterprise-only interfaces into community code.

#### Test Cases

* Build client only.
* Build server only.
* Build all apps through Nx.
* Modify shared editor extension and verify client/server compilation.
* Community build works without enterprise package.

---

## 24.3 Epic: Self-Hosted Deployment

### Feature 24.3.1: Standard Self-Hosted Installation

#### Use Cases

* A company deploys ConqrAI Wiki on its private server.
* A startup deploys on a VPS using Docker Compose.
* An enterprise deploys the platform behind a corporate reverse proxy.
* A customer uses S3-compatible storage and SMTP.

#### User Stories

* As a DevOps engineer, I want clear deployment documentation so that installation is predictable.
* As a self-hosted admin, I want configuration validation so that misconfiguration is detected early.
* As a security owner, I want all data to remain in company-controlled infrastructure.
* As an IT admin, I want optional services to be configurable without breaking the core app.

#### Acceptance Criteria

* Application can run with PostgreSQL and Redis.
* Required environment variables are documented.
* Optional services are documented.
* Migrations can be executed before production startup.
* Health checks show service status.
* Missing optional services disable only dependent features.
* Self-hosted deployment supports local storage and S3-compatible storage.

#### Functional Requirements

Required services:

* PostgreSQL database.
* Redis.
* Server application.
* Client application/static frontend.
* Background worker.
* Collaboration server.

Optional services:

* S3-compatible object storage.
* SMTP or Postmark mail.
* Typesense search.
* Gotenberg PDF export.
* Local or external AI provider.
* Reverse proxy.
* TLS termination.

Required environment variables:

* `APP_URL`.
* `APP_SECRET`.
* `DATABASE_URL`.
* `REDIS_URL`.

Common optional variables:

* `STORAGE_DRIVER`.
* `MAIL_DRIVER`.
* `SMTP_*`.
* `POSTMARK_*`.
* `TYPESENSE_*`.
* `GOTENBERG_URL`.
* `AI_PROVIDER_*`.

#### UX/UI Requirements

* Admin system health page should show status of required and optional services.
* Missing optional service should show a warning and list impacted features.
* License page should show whether the instance is community, business, or enterprise.
* Setup guide should include minimal and production-ready examples.

#### Technical Notes

* `APP_SECRET` must be strong and at least 32 characters.
* Startup should validate critical configuration.
* Database migrations should be run before starting new application version.
* Background workers should be separate processes for production.
* WebSocket routes must be correctly configured through reverse proxy.

#### Test Cases

* Deploy with local storage.
* Deploy with S3 storage.
* Configure SMTP and send test email.
* Configure Typesense and verify advanced search.
* Configure Gotenberg and export PDF.
* Missing Gotenberg disables PDF export with clear error.
* Invalid `APP_SECRET` blocks startup or shows critical warning.

---

### Feature 24.3.2: Docker and Docker Compose Deployment

#### Use Cases

* Small company wants quick self-hosted deployment.
* Developer wants production-like local environment.
* Customer wants a reproducible deployment template.

#### User Stories

* As an admin, I want Docker Compose deployment so that setup is easy.
* As a DevOps engineer, I want separate containers for app, worker, collaboration, database, and Redis so that I can operate them reliably.
* As a maintainer, I want logs and health checks so that support is easier.

#### Acceptance Criteria

* Docker images can be built.
* Docker Compose can start the full stack.
* Persistent volumes protect database and uploads.
* Environment variables configure services.
* Logs are accessible.
* Containers include health checks.

#### Functional Requirements

* Server Dockerfile.
* Client build/static serving strategy.
* Worker container.
* Collaboration container.
* PostgreSQL container.
* Redis container.
* Optional Typesense container.
* Optional Gotenberg container.
* Persistent volumes.
* Environment file support.
* Health checks.
* Restart policies.

#### UX/UI Requirements

* Deployment docs should include a minimal Compose file and production Compose file.
* Troubleshooting section should cover database connection, Redis connection, proxy, and file permission errors.
* Logs should be easy to find using documented commands.

#### Technical Notes

* Worker process should be separate from API process.
* Collaboration server should be independently scalable.
* Avoid baking secrets into images.
* Use non-root container user where possible.
* Uploaded files should be stored in a mounted volume when using local storage.

#### Test Cases

* Build Docker images.
* Start full stack with Compose.
* Restart containers and verify data persists.
* Worker processes import/export job.
* Collaboration WebSocket works through Compose network.
* Health checks return expected status.

---

### Feature 24.3.3: Kubernetes and Helm Deployment

#### Use Cases

* Enterprise deploys ConqrAI Wiki to Kubernetes.
* DevOps team scales workers independently.
* Collaboration server requires separate WebSocket routing.
* Customer uses managed PostgreSQL and Redis.

#### User Stories

* As a DevOps engineer, I want Kubernetes deployment so that the platform scales reliably.
* As an enterprise admin, I want separate deployments for API, workers, and collaboration so that resources can be tuned independently.
* As a platform engineer, I want Helm values so that deployment is repeatable across environments.

#### Acceptance Criteria

* Application can run in Kubernetes.
* API, workers, and collaboration server can scale separately.
* ConfigMaps and Secrets configure environment.
* Ingress supports HTTP and WebSocket routes.
* Readiness and liveness probes are available.
* Helm chart or manifest templates are documented.

#### Functional Requirements

* API deployment.
* Worker deployment.
* Collaboration deployment.
* Client/static frontend service.
* Kubernetes service objects.
* Ingress configuration.
* ConfigMap support.
* Secret support.
* Persistent volume support for local storage, if used.
* External PostgreSQL support.
* External Redis support.
* Horizontal scaling.
* Resource requests/limits.
* Readiness/liveness probes.

#### UX/UI Requirements

* Deployment guide should include architecture diagram.
* Helm values should be documented with examples.
* Troubleshooting should include WebSocket ingress issues.

#### Technical Notes

* Collaboration WebSocket path `/collab` must route correctly.
* Socket.io path `/socket.io` must support WebSocket upgrades.
* Queue workers should scale based on job load.
* Prefer managed PostgreSQL/Redis in production.
* Rolling upgrades should account for migration compatibility.

#### Test Cases

* Deploy to Kubernetes test cluster.
* Scale worker replicas.
* Scale API replicas.
* WebSocket collaboration works through ingress.
* Readiness probe blocks traffic until app is ready.
* Secret rotation updates deployment.

---

## 24.4 Epic: Air-Gapped Deployment

### Feature 24.4.1: Offline Enterprise Deployment

#### Use Cases

* Aerospace company deploys in isolated network.
* Government organization cannot allow outbound internet.
* Industrial customer uses local AI model and local storage.
* Enterprise wants no external telemetry.

#### User Stories

* As a security owner, I want air-gapped deployment so that no external network is required.
* As an admin, I want local services for storage, mail, search, PDF, and AI so that the system works offline.
* As an enterprise customer, I want offline license support so that paid features work in isolated environments.

#### Acceptance Criteria

* Core product works without internet access.
* External integrations can be disabled globally.
* Local storage, local mail relay, local search, and local AI are supported where configured.
* Cloud-only features are hidden or disabled.
* Air-gapped mode makes no unexpected external calls.
* Offline license behavior is documented.

#### Functional Requirements

* Air-gapped mode flag.
* Disable external telemetry.
* Disable cloud billing page.
* Disable external integration marketplace calls.
* Local file storage.
* Local SMTP relay.
* Local Typesense/search.
* Local Gotenberg.
* Local AI provider support.
* Offline license validation.
* Local help documentation.
* Offline update package documentation.

#### UX/UI Requirements

* System settings should clearly show air-gapped mode.
* Cloud-only features should not appear as broken.
* Integration settings should explain unavailable external connections.
* AI provider settings should encourage local provider configuration.

#### Technical Notes

* Avoid hard dependencies on external APIs.
* Package assets locally.
* Avoid remote fonts, remote scripts, remote analytics, or external image dependencies.
* License validation should support offline workflow if enterprise plan requires it.
* Public docs should use local assets only.

#### Test Cases

* App works with no internet access.
* No external network calls are made during normal operation.
* Local storage works.
* Local mail relay works.
* Local search works.
* Local AI provider works if configured.
* Cloud billing UI is hidden.

---

## 24.5 Epic: Background Jobs and Queue Infrastructure

### Feature 24.5.1: Queue-Based Processing

#### Use Cases

* Import large Confluence ZIP.
* Generate PDF export.
* Send notification emails.
* Re-index search after page updates.
* Run audit cleanup.
* Calculate documentation health.
* Process billing webhooks.

#### User Stories

* As a user, I want long-running tasks to run in the background so that the app remains responsive.
* As an admin, I want failed jobs to be visible so that operations can be fixed.
* As an engineer, I want retryable jobs so that temporary errors do not lose work.

#### Acceptance Criteria

* Long-running tasks run in Redis-backed queues.
* Failed jobs are retried according to policy.
* Job progress is visible where user-facing.
* Admin can monitor queue health.
* Jobs are idempotent where possible.
* Failed jobs store meaningful error details.

#### Functional Requirements

Queues:

* Email queue.
* File task/import queue.
* Notification queue.
* Audit queue.
* AI queue.
* Search indexing queue.
* General export queue.
* Billing queue.
* Documentation health queue.
* Verification queue.

Job features:

* Retry policy.
* Backoff policy.
* Job progress tracking.
* Job result storage.
* Job error storage.
* Job cancellation where safe.
* Admin job monitoring.
* Dead-letter handling, advanced.

#### UX/UI Requirements

* User-facing jobs should show progress: import, export, migration, OpenAPI generation.
* Admin health page should show queue status and failed jobs.
* Failed user jobs should show clear error and retry option when safe.

#### Technical Notes

* Use BullMQ with Redis.
* Separate high-cost AI jobs from general jobs.
* Jobs should be idempotent to avoid duplicate pages/emails after retry.
* Use job IDs linked to workspace/user/resource.
* Avoid storing secrets in job payloads.

#### Test Cases

* Import job runs in queue.
* Failed job retries.
* PDF export job completes.
* Queue health shows failed job.
* User sees import progress.
* Retry does not duplicate imported pages.

---

### Feature 24.5.2: Scheduled Jobs

#### Use Cases

* Detect expired verified pages daily.
* Clean old audit logs according to retention.
* Delete old export files.
* Calculate documentation health score nightly.
* Send weekly workspace summary.

#### User Stories

* As an admin, I want scheduled maintenance tasks so that governance happens automatically.
* As a knowledge manager, I want automatic reminders for expiring pages.
* As a security owner, I want retention cleanup to run without manual effort.

#### Acceptance Criteria

* Scheduled jobs can run reliably.
* Scheduled job failures are logged.
* Admin can see last run status.
* Jobs are safe to rerun.

#### Functional Requirements

Scheduled jobs:

* Audit cleanup.
* Trash cleanup.
* Export cleanup.
* Page verification expiring reminders.
* Page verification expiration.
* Documentation health calculation.
* Knowledge gap detection.
* Search index reconciliation.
* License expiration check.
* Weekly summary notifications.

#### UX/UI Requirements

* Admin system page should show scheduled job status.
* Show last run time, next run time, and last error.
* Allow manual trigger for safe jobs, such as health recalculation or search reindex.

#### Technical Notes

* Use distributed locks to avoid duplicate scheduled jobs in multi-instance deployments.
* Jobs must be idempotent.
* Timezone behavior should be defined.

#### Test Cases

* Scheduled job runs once in multi-instance environment.
* Failed scheduled job logs error.
* Manual trigger runs safe job.
* Audit cleanup deletes only eligible logs.

---

## 24.6 Epic: Storage and File Infrastructure

### Feature 24.6.1: Local and S3-Compatible Storage

#### Use Cases

* Small self-hosted installation stores files locally.
* Enterprise stores attachments in S3-compatible object storage.
* Cloud deployment uses managed object storage.
* Public shared page includes allowed attachments.

#### User Stories

* As an admin, I want to choose local or S3 storage so that deployment fits our infrastructure.
* As a user, I want uploaded files to be reliably available.
* As a security owner, I want file downloads to respect page permissions.

#### Acceptance Criteria

* Storage driver can be configured.
* File uploads work with selected storage driver.
* File downloads are permission-checked.
* Public attachment downloads respect public share settings.
* Storage failures are reported clearly.

#### Functional Requirements

* Local storage driver.
* S3-compatible storage driver.
* File upload.
* File download.
* File deletion.
* Attachment metadata.
* MIME type validation.
* File size limits.
* Signed URLs where needed.
* Public attachment access checks.
* Attachment indexing pipeline.

#### UX/UI Requirements

* File upload progress indicator.
* Clear upload failure messages.
* Attachment preview where possible.
* Admin storage settings show current storage driver.
* Public docs should show download buttons only when allowed.

#### Technical Notes

* Avoid direct public bucket exposure for private files.
* Attachment access must validate parent page access.
* Large files may require streaming upload/download.
* For S3, use scoped signed URLs and short expiration.

#### Test Cases

* Upload file with local storage.
* Upload file with S3 storage.
* Unauthorized user cannot download attachment.
* Public share cannot download attachment when disabled.
* Oversized file is rejected.
* Unsupported MIME type is rejected.

---

### Feature 24.6.2: Attachment Processing and Indexing

#### Use Cases

* User uploads PDF and wants it searchable.
* DOCX attachment content appears in search results.
* Admin wants failed indexing jobs visible.

#### User Stories

* As a user, I want uploaded documents to be searchable so that knowledge inside files is discoverable.
* As an admin, I want attachment indexing status so that failed processing can be fixed.
* As a security owner, I want attachment search to respect page permissions.

#### Acceptance Criteria

* Supported attachments are processed for text extraction.
* Extracted text is indexed.
* Attachment search results link to parent page.
* Failed indexing is visible.
* Search results respect permissions.

#### Functional Requirements

* Extract text from PDF.
* Extract text from DOCX.
* Extract text from TXT/Markdown.
* Store extracted text.
* Index extracted text.
* Show indexing status.
* Retry failed indexing.
* Search attachment content.

#### UX/UI Requirements

* Attachment detail should show indexing status: pending, indexed, failed.
* Search results should label attachment matches clearly.
* Failed indexing should show retry action for admins.

#### Technical Notes

* Run extraction in background jobs.
* Limit file size for extraction.
* Use safe parsers and sandboxing where possible.
* Attachment text should inherit parent page permissions.

#### Test Cases

* Upload PDF and search text inside it.
* Upload DOCX and search text inside it.
* Failed extraction appears in admin status.
* Restricted attachment does not appear in unauthorized search.

---

## 24.7 Epic: Database and Migrations

### Feature 24.7.1: Database Migrations and Type Generation

#### Use Cases

* Backend engineer creates a new table for audit logs.
* Admin upgrades self-hosted deployment.
* Developer regenerates DB types after schema change.

#### User Stories

* As a backend engineer, I want migrations so that schema changes are controlled.
* As a self-hosted admin, I want safe upgrade instructions so that data is protected.
* As a developer, I want generated DB types so that queries are type-safe.

#### Acceptance Criteria

* Migrations can be created.
* Pending migrations can be run.
* Last migration can be rolled back in supported environments.
* DB types can be regenerated.
* Migration failures are visible and stop unsafe startup.

#### Functional Requirements

* Create migration.
* Run next migration.
* Run all pending migrations.
* Rollback last migration, development/supported only.
* Regenerate DB types.
* Show migration status, optional.
* Backup recommendation before major migrations.

#### UX/UI Requirements

* Admin/deployment docs should include migration commands.
* Error messages should include migration name and failure reason.
* Upgrade guide should call out destructive migrations.

#### Technical Notes

* Use Kysely migrations.
* Production rollback policy should be conservative.
* Schema changes should be backward-compatible when possible.
* Migration code should be reviewed carefully because self-hosted customers run it on real data.

#### Test Cases

* Run migration successfully.
* Rollback migration in development.
* Regenerate DB types after schema change.
* Failed migration prevents app from running with incompatible schema.

---

### Feature 24.7.2: Tenant Data Isolation

#### Use Cases

* Cloud deployment hosts multiple workspaces.
* Enterprise workspace data must not leak into another workspace.
* Search, AI, exports, and APIs must remain workspace-scoped.

#### User Stories

* As a security owner, I want workspace data isolated so that tenants cannot access each other’s data.
* As a developer, I want clear tenant scoping rules so that queries are safe.
* As an admin, I want confidence that integrations and API keys are workspace-bound.

#### Acceptance Criteria

* Workspace-scoped tables include `workspaceId` where applicable.
* Queries filter by workspace.
* API keys are scoped to workspace.
* Search indexes are workspace-scoped.
* AI retrieval is workspace-scoped.

#### Functional Requirements

* Workspace ID on core tables.
* Workspace-scoped repositories.
* Tenant-aware search indexing.
* Tenant-aware AI indexing.
* Tenant-aware file storage paths.
* Tenant-aware audit logs.

#### UX/UI Requirements

* Not directly visible, but errors should never reveal cross-workspace existence.

#### Technical Notes

* Repository pattern should enforce workspace scoping.
* Add tests for cross-tenant access attempts.
* Public share tokens should resolve workspace safely.

#### Test Cases

* User from workspace A cannot access page from workspace B.
* API key from workspace A cannot access workspace B.
* Search in workspace A does not return workspace B content.
* AI Search in workspace A does not retrieve workspace B content.

---

## 24.8 Epic: Observability and System Health

### Feature 24.8.1: Operational Health Monitoring

#### Use Cases

* Admin checks why emails are not sending.
* DevOps checks search indexing failures.
* Support investigates AI provider errors.
* Self-hosted customer checks queue worker health.

#### User Stories

* As a self-hosted admin, I want system health checks so that I can troubleshoot issues.
* As a support engineer, I want logs and job status so that failures are diagnosable.
* As a DevOps engineer, I want service health endpoints for monitoring.

#### Acceptance Criteria

* System health page shows status of major services.
* Health endpoints exist for infrastructure monitoring.
* Errors are logged with redaction.
* Queue failures are visible.
* Admin can identify missing configuration.

#### Functional Requirements

Health checks:

* Database.
* Redis.
* Storage.
* Mail.
* Search.
* PDF service.
* Collaboration server.
* AI provider.
* Queue workers.
* License status.

Observability:

* Error logs.
* Job logs.
* AI usage logs.
* Search no-result logs.
* Collaboration errors.
* Import/export job errors.
* Integration delivery failures.

#### UX/UI Requirements

* Use status badges: healthy, degraded, unavailable.
* Show last checked time.
* Provide troubleshooting hints.
* Avoid exposing secrets.
* Allow admins to copy diagnostic summary.

#### Technical Notes

* Health endpoints should be protected where sensitive.
* Basic unauthenticated liveness endpoint can return only minimal status.
* Logs should redact tokens, passwords, license keys, and API keys.
* Use structured logging where possible.

#### Test Cases

* Healthy services show green status.
* Missing mail config shows warning.
* Broken Redis shows error.
* Logs redact secrets.
* Health endpoint returns degraded status when optional service fails.

---

### Feature 24.8.2: Diagnostics Bundle

#### Use Cases

* Self-hosted customer needs to send support information without exposing data.
* Admin investigates failed import.
* Support engineer needs queue/job state.

#### User Stories

* As an admin, I want to generate a diagnostic report so that support can help me faster.
* As a security owner, I want diagnostics to exclude secrets and page content by default.
* As a support engineer, I want version and configuration summary so that troubleshooting is easier.

#### Acceptance Criteria

* Admin can generate diagnostics bundle.
* Bundle redacts secrets.
* Bundle excludes page content by default.
* Bundle includes service health, app version, configuration summary, and recent job failures.

#### Functional Requirements

Diagnostics include:

* App version.
* Deployment mode.
* Enabled features.
* License status summary.
* Service health.
* Queue status.
* Recent job failures.
* Recent error IDs.
* Config summary with redaction.
* Database migration status.

#### UX/UI Requirements

* Diagnostics button in system health page.
* Clear explanation of included data.
* Downloadable file.
* Warning not to share publicly.

#### Technical Notes

* Redact all secrets.
* Avoid including user content unless explicit admin opt-in.
* Diagnostics can be JSON or ZIP.

#### Test Cases

* Generate diagnostics bundle.
* Secrets are redacted.
* Page content is excluded.
* Bundle includes queue failure summary.

---

## 24.9 Epic: Backup, Restore and Disaster Recovery

### Feature 24.9.1: Backup Strategy

#### Use Cases

* Self-hosted customer needs daily backups.
* Enterprise requires disaster recovery plan.
* Admin wants to know which components need backup.

#### User Stories

* As an admin, I want backup documentation so that we can recover from failure.
* As an enterprise customer, I want restore procedures so that business continuity is protected.
* As a DevOps engineer, I want to know which data must be backed up.

#### Acceptance Criteria

* Backup requirements are documented.
* Database and file storage are included.
* Search index is documented as rebuildable.
* Restore procedure is documented and testable.

#### Functional Requirements

Backup scope:

* PostgreSQL database.
* File storage.
* Environment configuration.
* License configuration.
* Optional custom branding assets.
* Search index rebuild procedure.
* Redis queues policy.

Backup documentation:

* Daily backup recommendation.
* Retention recommendation.
* Encryption recommendation.
* Offsite backup recommendation.
* Restore testing recommendation.

#### UX/UI Requirements

* Admin docs should include backup checklist.
* System health page can optionally show last backup if integrated.
* Backup warning if no backup integration/status is configured, optional.

#### Technical Notes

* Application may not perform backups itself in MVP; it should document what customer infrastructure must back up.
* Search index should be rebuildable from database content.
* Redis queue data may be transient; define policy.

#### Test Cases

* Backup checklist includes database and file storage.
* Search index rebuild works after restore.
* Restored instance loads pages and attachments.

---

### Feature 24.9.2: Restore Procedure

#### Use Cases

* Database corruption requires restore.
* File storage is accidentally deleted.
* Customer tests disaster recovery in staging.

#### User Stories

* As a DevOps engineer, I want a restore procedure so that we can recover from incidents.
* As an admin, I want validation steps after restore so that I know the system is healthy.

#### Acceptance Criteria

* Restore steps are documented.
* Restore includes database and files.
* Search index can be rebuilt.
* Health checks validate restore.

#### Functional Requirements

Restore steps:

* Stop application.
* Restore database.
* Restore file storage.
* Restore environment configuration.
* Run migrations if needed.
* Rebuild search index.
* Validate health checks.
* Validate sample pages/attachments.
* Restart workers.

#### UX/UI Requirements

* Restore documentation should be step-by-step.
* Provide post-restore checklist.

#### Technical Notes

* Restoring to a different APP_URL may require URL/config updates.
* Restore process should avoid running workers during database restore.

#### Test Cases

* Restore database backup in staging.
* Restore file storage.
* Rebuild search index.
* Validate attachments after restore.
* Validate collaboration after restore.

---

## 24.10 Epic: Upgrade and Release Management

### Feature 24.10.1: Safe Upgrade Process

#### Use Cases

* Self-hosted customer upgrades to a new release.
* Enterprise reviews breaking changes before upgrade.
* Admin wants rollback guidance.

#### User Stories

* As a self-hosted admin, I want upgrade instructions so that I can update safely.
* As an enterprise customer, I want release notes so that I know what changed.
* As a DevOps engineer, I want migration warnings so that I can prepare.

#### Acceptance Criteria

* Release notes are available.
* Migration steps are documented.
* Breaking changes are highlighted.
* Upgrade process includes backup recommendation.
* Post-upgrade validation checklist exists.

#### Functional Requirements

* Versioned release notes.
* Migration guide.
* Pre-upgrade checklist.
* Post-upgrade checklist.
* Breaking change section.
* Rollback guidance.
* Compatibility notes.
* Current version display.

#### UX/UI Requirements

* Admin system page should show current version.
* Optional update notification for self-hosted if internet is available and allowed.
* Release notes should be accessible from admin UI or documentation.

#### Technical Notes

* Database migrations should be backward-compatible where possible.
* Major upgrades should document manual actions.
* Rolling deployments require compatibility between old/new app versions and schema.

#### Test Cases

* Upgrade staging environment.
* Migrations complete successfully.
* Existing pages load after upgrade.
* Feature entitlements remain correct after upgrade.
* Rollback guide is valid for supported cases.

---

### Feature 24.10.2: Version and Environment Information

#### Use Cases

* Support asks customer which version they are running.
* Admin checks whether instance is cloud, self-hosted, or air-gapped.
* DevOps checks build commit and migration status.

#### User Stories

* As an admin, I want to see system version so that support and upgrades are easier.
* As a support engineer, I want environment details so that troubleshooting is faster.

#### Acceptance Criteria

* Admin can view app version.
* Admin can view deployment mode.
* Admin can view migration status.
* Sensitive environment variables are not shown.

#### Functional Requirements

* Show app version.
* Show build commit, optional.
* Show deployment mode.
* Show cloud/self-hosted mode.
* Show enterprise package status.
* Show migration status.
* Show enabled optional services.

#### UX/UI Requirements

* System information card in admin settings.
* Copy diagnostics summary button.
* Redact sensitive details.

#### Technical Notes

* Version can be injected at build time.
* Build metadata should not expose secrets.

#### Test Cases

* System page displays version.
* Migration status is accurate.
* Sensitive env vars are hidden.

---

# 25. Product Area: Global Non-Functional Requirements

## 25.1 Product Area Overview

Non-functional requirements define the quality attributes that ConqrAI Wiki must satisfy across all modules. These requirements ensure the platform is secure, performant, reliable, scalable, accessible, maintainable, and privacy-conscious.

---

## 25.2 Epic: Security Requirements

### Feature 25.2.1: Secure-by-Default Platform

#### Use Cases

* A workspace contains confidential HR policies.
* AI Search runs over private engineering documents.
* Public sharing is enabled for one page but must not expose the full workspace.
* API key calls must not bypass permissions.

#### User Stories

* As a security owner, I want secure defaults so that accidental exposure is minimized.
* As an admin, I want all protected APIs authenticated and authorized.
* As a user, I want my restricted pages protected across search, AI, exports, and integrations.

#### Acceptance Criteria

* All protected APIs require authentication.
* All sensitive actions require authorization.
* Public routes expose only public-safe data.
* Search, AI, export, MCP, API keys, integrations, and notifications are permission-aware.
* Secrets are never logged.
* API keys are hashed.
* Provider tokens are encrypted.

#### Functional Requirements

* Server-side authorization.
* Secure session cookies.
* CSRF protection where applicable.
* Rate limiting.
* Password hashing.
* API key hashing.
* Token encryption.
* Secret redaction.
* Permission-aware retrieval.
* Public-safe DTOs.
* Audit sensitive actions.

#### UX/UI Requirements

* Security errors should be clear but not leak private information.
* Admin settings should show risk warnings.
* Dangerous actions should require confirmation.

#### Technical Notes

* Do not rely on frontend checks.
* Use centralized authorization services.
* Use secure headers.
* Use strict CORS settings.
* Use dependency scanning in CI where possible.

#### Test Cases

* Unauthenticated request returns 401.
* Unauthorized request returns 403 or safe 404.
* Restricted page hidden from search.
* AI excludes restricted content.
* Secrets do not appear in logs.

---

## 25.3 Epic: Performance Requirements

### Feature 25.3.1: Responsive User Experience

#### Use Cases

* User opens a large page.
* Workspace contains thousands of pages.
* Search runs across large documentation base.
* Multiple users collaborate on the same page.

#### User Stories

* As a user, I want pages to load quickly so that work feels smooth.
* As an admin, I want large workspaces to remain usable.
* As an editor, I want real-time collaboration to stay responsive.

#### Acceptance Criteria

* Normal page loads are fast.
* Search responds quickly for typical queries.
* Page tree remains usable for large spaces.
* Heavy operations run in background jobs.
* Collaboration remains stable under expected concurrent editing.

#### Functional Requirements

* Pagination.
* Lazy loading page tree.
* Search indexing.
* Query optimization.
* Background processing.
* Caching where safe.
* Debounced autosave.
* Efficient WebSocket sync.

#### UX/UI Requirements

* Show skeleton/loading states.
* Avoid blocking UI during background operations.
* Show progress for long-running jobs.

#### Technical Notes

* Avoid loading full workspace tree when not necessary.
* Use database indexes for common filters.
* Precompute analytics.
* Use queue for expensive tasks.

#### Test Cases

* Large page loads within acceptable threshold.
* Large space tree lazy-loads correctly.
* Search performance under load.
* Import job does not block normal page browsing.

---

## 25.4 Epic: Reliability and Resilience

### Feature 25.4.1: Data Safety and Recovery

#### Use Cases

* User loses internet while editing.
* Worker fails during import.
* Collaboration server reconnects.
* Export job fails temporarily and retries.

#### User Stories

* As an editor, I want autosave so that I do not lose work.
* As a user, I want failed long-running jobs to be retryable.
* As an admin, I want system failures to degrade gracefully.

#### Acceptance Criteria

* Autosave protects content.
* Collaboration reconnects after temporary disconnect.
* Background jobs retry transient failures.
* Failed jobs show clear status.
* System degradation is visible in health page.

#### Functional Requirements

* Autosave.
* Version history.
* Retryable jobs.
* Job status.
* Health checks.
* Graceful error states.
* Reconnect handling.
* Transactional critical updates.

#### UX/UI Requirements

* Show save status.
* Show offline/reconnecting state.
* Show retry action where safe.
* Avoid silent failures.

#### Technical Notes

* Use database transactions for multi-step operations.
* Use idempotent job design.
* Use CRDT conflict-free collaboration.

#### Test Cases

* Disconnect during editing and reconnect.
* Worker crash during job and retry.
* Autosave persists draft.
* Failed export shows retry option.

---

## 25.5 Epic: Accessibility Requirements

### Feature 25.5.1: Accessible Internal and Public UX

#### Use Cases

* User navigates with keyboard.
* User relies on screen reader.
* Public documentation must be accessible to customers.

#### User Stories

* As a keyboard user, I want to navigate the app without a mouse.
* As a screen reader user, I want meaningful labels so that I understand controls.
* As an admin, I want public docs to meet accessibility expectations.

#### Acceptance Criteria

* Core navigation supports keyboard use.
* Forms have labels and accessible errors.
* Modals manage focus correctly.
* Color is not the only status indicator.
* Public docs use semantic HTML.

#### Functional Requirements

* Keyboard navigation.
* Visible focus states.
* ARIA labels where needed.
* Form labels.
* Accessible error messages.
* Reduced motion support.
* Semantic public docs rendering.

#### UX/UI Requirements

* Maintain contrast ratios.
* Do not hide critical information inside inaccessible tooltips.
* Ensure buttons and controls have clear labels.

#### Technical Notes

* Use accessible UI primitives.
* Add accessibility checks to QA.
* Test editor interactions carefully.

#### Test Cases

* Navigate sidebar with keyboard.
* Open modal and close with keyboard.
* Screen reader announces form labels.
* Public page passes accessibility audit.

---

# 26. Product Area: Global Test Strategy

## 26.1 Product Area Overview

Global Test Strategy defines how ConqrAI Wiki should be validated across frontend, backend, collaboration, permissions, AI, import/export, integrations, billing, and deployment.

A documentation platform handles sensitive knowledge and complex workflows. Therefore, testing must cover correctness, security, permissions, reliability, and data integrity.

---

## 26.2 Epic: Test Pyramid

### Feature 26.2.1: Unit Testing

#### Use Cases

* Validate permission resolution.
* Validate feature gating.
* Validate import conversion helpers.
* Validate AI tool permission checks.

#### User Stories

* As an engineer, I want unit tests so that core logic remains stable.
* As a maintainer, I want fast tests so that pull requests are safe to merge.

#### Acceptance Criteria

* Critical service logic has unit tests.
* Tests run quickly.
* Tests are deterministic.
* Permission and security logic is well covered.

#### Functional Requirements

Unit tests for:

* Permission services.
* Workspace/space/page services.
* Feature gating.
* License validation.
* Search query builders.
* Import/export utilities.
* AI tool authorization.
* Verification state machine.
* Public share validation.
* Webhook signature logic.

#### UX/UI Requirements

* Not applicable.

#### Technical Notes

* Use Jest for server tests.
* Mock external providers.
* Avoid requiring real network access.

#### Test Cases

* `canViewPage` handles direct page permission.
* `hasFeature` returns false for free tier.
* Public share expiration validation fails expired link.
* AI tool update page fails without edit permission.

---

### Feature 26.2.2: Integration Testing

#### Use Cases

* Test API endpoints with database.
* Test authentication flows.
* Test import job with queue.
* Test search indexing.

#### User Stories

* As a backend engineer, I want integration tests so that modules work together.
* As a QA engineer, I want API tests so that regressions are caught.

#### Acceptance Criteria

* Critical API flows are covered.
* Tests use test database.
* External integrations are mocked.
* Permission behavior is tested end-to-end at API level.

#### Functional Requirements

Integration tests for:

* Login/logout.
* SSO config, mocked.
* MFA setup.
* Page CRUD.
* Space permissions.
* Page restrictions.
* Comments.
* Search indexing.
* Public sharing.
* Import/export jobs.
* API key auth.
* Audit event creation.

#### UX/UI Requirements

* Not applicable.

#### Technical Notes

* Use isolated test database.
* Clean database between tests.
* Use supertest or equivalent for server E2E.

#### Test Cases

* Create page API succeeds for writer.
* Create page API fails for reader.
* Restricted page hidden from search API.
* Public share route returns safe DTO.

---

### Feature 26.2.3: End-to-End Testing

#### Use Cases

* Validate full user workflows in browser.
* Test collaboration UI.
* Test public sharing flow.
* Test AI answer with citations, mocked provider.

#### User Stories

* As a QA engineer, I want browser tests so that real user workflows are validated.
* As a product owner, I want critical flows protected from regressions.

#### Acceptance Criteria

* Critical user journeys are automated.
* Tests run in CI where possible.
* AI/external dependencies are mocked or controlled.
* E2E failures provide useful screenshots/traces.

#### Functional Requirements

E2E flows:

* Create workspace.
* Invite user.
* Create space.
* Create page.
* Edit page.
* Comment and resolve comment.
* Restrict page.
* Search page.
* Create public link.
* Revoke public link.
* Import Markdown.
* Export PDF, if service available/mocked.
* AI answer with citations, mocked.

#### UX/UI Requirements

* Test selectors should be stable and not depend on visual text only.

#### Technical Notes

* Use Playwright or equivalent.
* Mock AI provider and external integrations.
* Use seeded test data.

#### Test Cases

* Full editor workflow.
* Public share workflow.
* Page restriction workflow.
* Comment workflow.
* AI Search workflow with mocked response.

---
# ConqrAI Wiki — Detailed Continuation from 26.3 Specialized Test Suites to End

## Document Purpose

This document continues the ConqrAI Wiki product documentation from:

**26.3 Epic: Specialized Test Suites**

It expands the remaining quality, roadmap, positioning, and future innovation sections using the structure:

**Product Area → Epic → Feature → Use Cases → User Stories → Acceptance Criteria → Functional Requirements → UX/UI Requirements → Technical Notes → Test Cases**

---

# 26.3 Epic: Specialized Test Suites

## 26.3.1 Feature: Security and Permission Test Suite

### Use Cases

* A user tries to access a restricted page directly by URL.
* A user searches for a restricted page title.
* AI Search attempts to retrieve restricted content.
* An API key attempts to access a page outside its permission scope.
* A public link attempts to expose private child pages or attachments.
* A guest user tries to browse internal workspace spaces.
* MCP tools attempt to perform actions beyond the API key or user permissions.

### User Stories

* As a security owner, I want automated security tests so that private documentation is not leaked.
* As a backend engineer, I want permission tests across all APIs so that new features do not bypass authorization.
* As an admin, I want confidence that public sharing and AI features respect workspace security.
* As an enterprise customer, I want proof that restricted data is protected across search, export, AI, integrations, and public routes.

### Acceptance Criteria

* Restricted pages cannot be accessed through direct API calls.
* Restricted page titles and snippets do not appear in search results.
* AI Search and AI Chat never retrieve inaccessible sources.
* Exports exclude inaccessible pages and attachments.
* Public routes return only public-safe data.
* API keys and MCP tools obey the same permissions as normal users.
* Cross-workspace access is blocked.
* Tests cover positive and negative permission cases.

### Functional Requirements

Security test suite must cover:

* Workspace role checks.
* Space permission checks.
* Page-level restriction checks.
* Group permission inheritance.
* Public share safety.
* API key authorization.
* MCP tool authorization.
* AI Search retrieval filtering.
* AI Chat tool permission checks.
* Attachment access control.
* Export permission filtering.
* Notification safety.
* Integration access control.
* Cross-tenant isolation.
* Guest user isolation.

### UX/UI Requirements

* Not directly applicable to automated tests.
* However, test failures should produce readable reports that help engineers understand the failed security rule.
* Security test cases should be documented in QA reports for enterprise confidence.

### Technical Notes

* Build reusable fixtures for users, groups, spaces, pages, restricted pages, guests, API keys, and public shares.
* Include direct object reference tests using raw IDs.
* Include cross-workspace test data to detect tenant isolation issues.
* Run critical security tests in CI before merging.
* Mock AI provider output, but test actual retrieval filtering logic.
* Test both API layer and service layer where possible.

### Test Cases

#### Page Access

* User with reader access can view page.
* User without access receives 403 or safe 404.
* User cannot fetch restricted page by ID.
* User cannot edit page without writer permission.

#### Search Access

* Restricted page does not appear in full-text search.
* Restricted page does not appear in search suggestions.
* Attachment from restricted page does not appear in attachment search.

#### AI Access

* AI Search excludes restricted page.
* AI Chat cannot summarize inaccessible page.
* AI tool `update_page` fails without edit permission.
* AI source citations include only accessible pages.

#### Public Access

* Public link does not expose internal comments.
* Public page does not expose permission metadata.
* Public page tree excludes restricted children.
* Revoked public link cannot access content.

#### API and MCP

* API key cannot read page outside its scope.
* Revoked API key fails authentication.
* MCP `get_page` fails for inaccessible page.
* MCP `create_page` requires write permission.

#### Tenant Isolation

* User from workspace A cannot access workspace B page.
* Search from workspace A does not return workspace B data.
* AI from workspace A cannot retrieve workspace B documents.

---

## 26.3.2 Feature: Performance and Load Test Suite

### Use Cases

* A workspace contains 50,000 pages.
* A space contains a deeply nested page tree.
* Search runs under heavy usage.
* Many users edit pages at the same time.
* Large imports and exports run while users continue browsing.
* AI Search receives many simultaneous questions.

### User Stories

* As an admin, I want the platform to remain fast as the company grows.
* As a user, I want search and page loading to feel responsive.
* As an engineer, I want performance baselines so regressions are detected early.
* As an enterprise customer, I want confidence that the platform can scale to large documentation sets.

### Acceptance Criteria

* Performance baselines are defined for critical workflows.
* Load tests cover page reads, search, collaboration, imports, exports, and AI endpoints.
* Heavy jobs do not block normal usage.
* Page tree uses lazy loading or pagination for large spaces.
* Search latency remains within acceptable thresholds for typical queries.
* Performance results can be compared across releases.

### Functional Requirements

Performance tests should cover:

* Page read latency.
* Page edit save latency.
* Page tree load performance.
* Search response latency.
* Attachment search performance.
* Public docs page load performance.
* AI Search latency.
* AI Chat streaming start latency.
* Import throughput.
* Export throughput.
* PDF export job duration.
* Collaboration sync under concurrent users.
* Dashboard analytics calculation time.

Suggested performance targets should be defined for:

* p50 latency.
* p95 latency.
* p99 latency.
* Throughput.
* Maximum acceptable job duration.
* Maximum queue waiting time.

### UX/UI Requirements

* Loading states must appear for operations that exceed short thresholds.
* Long-running jobs must show progress.
* Users should not experience full-page blocking during imports, exports, reindexing, or AI generation.

### Technical Notes

* Use realistic seeded data: users, groups, spaces, nested pages, comments, attachments, and permissions.
* Separate application performance from external provider latency by mocking AI and integration providers.
* Run database query analysis for slow endpoints.
* Track performance in CI or scheduled benchmark environment.
* Use production-like indexes.

### Test Cases

* Load page with large content.
* Load space tree with 10,000 pages using lazy loading.
* Search across 100,000 indexed documents.
* Run 100 simultaneous search requests.
* Run import job while browsing pages.
* Run export job while editing another page.
* Simulate 20 collaborators editing same page.
* Simulate 100 public docs page views per minute.
* AI Search streams first token within target threshold using mocked provider.

---

## 26.3.3 Feature: Real-Time Collaboration Test Suite

### Use Cases

* Multiple users edit the same page simultaneously.
* A user loses connection while editing.
* Two users edit the same paragraph.
* Collaboration server restarts.
* Unauthorized user tries to connect to a collaboration room.

### User Stories

* As an editor, I want collaborative editing to preserve everyone’s changes.
* As a user, I want reconnect behavior so that temporary network issues do not lose work.
* As a security owner, I want collaboration rooms protected by page permissions.
* As an engineer, I want collaboration tests so that Yjs/Hocuspocus changes do not break editing.

### Acceptance Criteria

* Multiple users can edit the same page without conflicts.
* Cursor presence appears and disappears correctly.
* Unauthorized users cannot join collaboration rooms.
* Reconnection syncs missed updates.
* Persisted Yjs document state survives page reload.
* Collaboration server failure is handled gracefully.

### Functional Requirements

Test coverage:

* Join collaboration room.
* Leave collaboration room.
* Cursor presence.
* Concurrent edits.
* Offline/reconnect.
* Persistence.
* Authorization.
* Server restart recovery.
* Large document editing.
* Comment marks and resolved states.

### UX/UI Requirements

* Connection state should be visible when disconnected or reconnecting.
* Users should see collaborators’ cursors clearly.
* Save/sync status should not be misleading.

### Technical Notes

* Use integration tests for collaboration server where possible.
* Use browser E2E tests for real multi-user workflows.
* Simulate network disconnects.
* Test permission changes while collaboration session is active.

### Test Cases

* Two users edit different paragraphs and both changes persist.
* Two users edit same paragraph and CRDT resolves correctly.
* User disconnects, edits locally if supported, reconnects, and syncs.
* Unauthorized user cannot open WebSocket room.
* User loses permission during active session and is disconnected or blocked from further sync.
* Collaboration server restart does not corrupt document.

---

## 26.3.4 Feature: AI Quality and Safety Test Suite

### Use Cases

* AI answer cites wrong source.
* AI answer uses inaccessible source.
* AI hallucinates when no documentation exists.
* AI tool modifies a page without permission.
* AI output quality regresses after model/provider change.

### User Stories

* As an AI admin, I want AI tests so that answer quality and safety are monitored.
* As a security owner, I want AI permission tests so that private content is protected.
* As a knowledge manager, I want AI no-answer behavior so that missing documentation is detected.
* As a user, I want AI answers grounded in sources so that I can trust them.

### Acceptance Criteria

* AI retrieval is permission-aware.
* AI answers include citations when sources are used.
* AI does not fabricate confident answers when sources are weak.
* AI tools enforce action permissions.
* AI feedback and logs are created according to retention settings.
* Regression dataset can be evaluated periodically.

### Functional Requirements

AI test suite should cover:

* Retrieval quality.
* Citation accuracy.
* Permission filtering.
* No-answer handling.
* Low-confidence handling.
* Tool authorization.
* Streaming response format.
* Feedback capture.
* Token/cost tracking.
* Rate limiting.
* Provider failure handling.

### UX/UI Requirements

* AI answer should display sources clearly.
* Low-confidence answers should show warning.
* Failed AI requests should show recoverable error where possible.
* User should be able to submit feedback.

### Technical Notes

* Use mocked AI provider for deterministic functional tests.
* Maintain a small evaluation dataset with expected source documents.
* Separate RAG retrieval tests from generation tests.
* Use golden tests for prompt/tool schema where possible.
* Do not call external providers in normal CI unless explicitly configured.

### Test Cases

* AI answer cites correct page for known question.
* AI returns insufficient information when no source exists.
* AI excludes restricted source.
* AI Chat `create_page` succeeds only with permission.
* AI Chat `update_page` fails without edit permission.
* Streaming response returns valid event sequence.
* Negative feedback creates AI feedback record.
* AI rate limit blocks excessive requests.

---

## 26.3.5 Feature: Import, Export and Migration Test Suite

### Use Cases

* Customer imports Confluence ZIP.
* User imports DOCX document.
* Admin exports a full space.
* PDF export fails because Gotenberg is unavailable.
* Migration creates duplicate pages if retried incorrectly.

### User Stories

* As an admin, I want import tests so that migrations are reliable.
* As a user, I want export tests so that exported files are complete and readable.
* As a customer success manager, I want migration validation so that customer onboarding is predictable.

### Acceptance Criteria

* Supported import formats are tested.
* Import errors are captured and reported.
* Export respects permissions.
* Retried imports do not duplicate content unexpectedly.
* Exported files include correct page hierarchy and attachments where selected.

### Functional Requirements

Test coverage:

* Markdown import.
* HTML import.
* DOCX import.
* Notion ZIP import.
* Confluence ZIP import.
* Attachment import.
* Import progress.
* Import error reporting.
* Import rollback, if implemented.
* Markdown export.
* HTML export.
* PDF export.
* Space ZIP export.
* Export permission filtering.

### UX/UI Requirements

* Import/export progress must be visible.
* Errors must be actionable.
* Export completion should notify user.

### Technical Notes

* Maintain fixture files for each supported format.
* Use deterministic expected outputs where possible.
* Mock external PDF service for regular CI and run real service in integration environment.
* Import jobs should be idempotent or clearly detect duplicates.

### Test Cases

* Import Markdown with headings, tables, code blocks, and images.
* Import DOCX with headings, lists, and tables.
* Import Confluence ZIP preserving hierarchy.
* Import job failure creates error report.
* Export page as Markdown.
* Export page as PDF.
* Space export excludes restricted pages.
* Retry import does not create duplicates beyond expected policy.

---

## 26.3.6 Feature: Billing, Licensing and Feature Gating Test Suite

### Use Cases

* Free user accesses locked feature.
* Business license unlocks SSO but not SCIM.
* Enterprise license unlocks audit logs and retention.
* Cloud billing webhook changes plan.
* Expired license falls back to free or locked state.

### User Stories

* As a product owner, I want billing tests so that paid features are enforced correctly.
* As an admin, I want plan changes to reliably update feature access.
* As an engineer, I want feature gating tests so that new endpoints are not accidentally left ungated.

### Acceptance Criteria

* Feature entitlements are correct by plan.
* Server blocks unavailable paid features.
* Frontend locked state matches server entitlements.
* License activation/removal updates entitlements.
* Stripe webhooks are signature-verified.
* Seat limits are enforced.

### Functional Requirements

Test coverage:

* Feature registry.
* Entitlements endpoint.
* Server-side feature guard.
* Client feature hook.
* License activation.
* License removal.
* License expiration.
* Seat limit enforcement.
* Stripe checkout flow, mocked.
* Stripe webhook processing.
* Billing portal link, mocked.

### UX/UI Requirements

* Locked feature messages should be tested for correct context:

  * Cloud upgrade.
  * Self-hosted paid license required.
  * License tier upgrade required.

### Technical Notes

* Mock Stripe in tests.
* Use signed webhook fixtures.
* Use test licenses for self-hosted license validation.
* Add tests for direct API calls to gated endpoints.

### Test Cases

* Free workspace cannot use PDF export.
* Business workspace can use SSO.
* Business workspace cannot use SCIM.
* Enterprise workspace can view audit logs.
* Invalid license is rejected.
* Expired license locks paid features.
* Stripe webhook upgrades plan.
* Client entitlement manipulation does not unlock backend endpoint.

---

## 26.3.7 Feature: Integration and Webhook Test Suite

### Use Cases

* Slack token expires.
* GitHub webhook triggers repository sync.
* Jira issue is created from comment.
* Webhook delivery fails and retries.
* Integration tries to access restricted page.

### User Stories

* As an admin, I want integration tests so that connected workflows are reliable.
* As a security owner, I want integrations to respect permissions and token security.
* As a developer, I want webhook tests so that automations do not break silently.

### Acceptance Criteria

* Integration providers can be mocked.
* Integration tokens are encrypted and redacted.
* Webhook signatures are verified.
* Failed deliveries are retried.
* Restricted content is not exposed through integrations.

### Functional Requirements

Test coverage:

* Slack notification delivery.
* Teams notification delivery.
* Jira issue linking.
* GitHub repository import.
* OpenAPI import from repository.
* Webhook creation.
* Webhook signed delivery.
* Webhook retry.
* Integration token revocation.
* Integration permission checks.

### UX/UI Requirements

* Integration failure states should be visible in settings.
* Delivery history should show success/failure.

### Technical Notes

* Use provider mocks and local fake servers.
* Validate signature verification for incoming and outgoing webhooks.
* Redact tokens from test logs.

### Test Cases

* Slack test notification succeeds.
* Expired Slack token shows error.
* GitHub webhook triggers sync job.
* Jira issue creation handles permission error.
* Webhook delivery is signed.
* Failed webhook retries and records failure.

---

# 26.4 Epic: Test Automation, CI and Quality Gates

## 26.4.1 Feature: Continuous Integration Quality Gates

### Use Cases

* Pull request introduces failing unit test.
* Migration breaks type generation.
* Security test catches permission leak.
* Lint error prevents merge.

### User Stories

* As a maintainer, I want CI quality gates so that broken code is not merged.
* As an engineer, I want fast feedback so that I can fix issues early.
* As a security owner, I want permission tests required before release.

### Acceptance Criteria

* CI runs lint, typecheck, unit tests, and selected integration tests.
* Security-critical tests are required.
* Build must pass before merge.
* Test failures provide useful logs.

### Functional Requirements

CI stages:

* Install dependencies.
* Lint.
* Format check.
* Typecheck.
* Unit tests.
* Build client/server.
* Database migration test.
* Integration tests.
* Security permission tests.
* E2E smoke tests, optional.

### UX/UI Requirements

* CI output should be readable.
* Failed tests should identify module and reason.

### Technical Notes

* Use caching for pnpm dependencies.
* Use service containers for PostgreSQL and Redis.
* Mock external services.
* Run heavy E2E/performance tests nightly if too slow for PRs.

### Test Cases

* PR with lint error fails CI.
* PR with failing permission test fails CI.
* PR with build error fails CI.
* Successful PR passes all required checks.

---

## 26.4.2 Feature: Release Validation Suite

### Use Cases

* Team prepares a new product release.
* Self-hosted package is published.
* Enterprise customer needs stable release candidate.

### User Stories

* As a release manager, I want a release validation checklist so that releases are safe.
* As an enterprise customer, I want confidence that releases are tested.
* As a support engineer, I want known issues documented before release.

### Acceptance Criteria

* Release candidate passes critical regression tests.
* Migration tests pass.
* Upgrade path is tested.
* Release notes are prepared.
* Known issues are documented.

### Functional Requirements

Release validation:

* Full build.
* Migration test.
* Upgrade test.
* Core E2E suite.
* Security suite.
* Import/export suite.
* AI mocked suite.
* Public sharing suite.
* License/feature gating suite.
* Smoke test Docker image.

### UX/UI Requirements

* Release checklist should be visible to internal team.
* Release notes should be clear for customers.

### Technical Notes

* Maintain staging environment for release validation.
* Use seeded enterprise workspace for testing advanced features.

### Test Cases

* Upgrade previous version to release candidate.
* Run migrations successfully.
* Validate core workflows after upgrade.
* Docker image starts successfully.

---

# 27. Product Area: Recommended Roadmap

## 27.1 Product Area Overview

The roadmap organizes product delivery into practical phases. The goal is to build a reliable core first, then collaboration and quality, then enterprise security, then AI, then integrations, then governance intelligence, then external documentation, and finally enterprise operations.

---

## 27.2 Epic: Phase 1 — Core Wiki Foundation

### Feature 27.2.1: Foundational Wiki MVP

#### Use Cases

* A team needs to create internal documentation.
* A company wants basic spaces and pages.
* Users need search and comments.

#### User Stories

* As a user, I want to create and edit pages so that I can document knowledge.
* As a team lead, I want spaces so that documentation is organized.
* As a user, I want search so that I can find information quickly.

#### Acceptance Criteria

* Users can create spaces and pages.
* Rich editor works reliably.
* Page tree supports hierarchy.
* Basic comments work.
* Basic search works.
* Basic permissions protect private spaces.

#### Functional Requirements

* Workspace setup.
* Authentication.
* Spaces.
* Pages.
* Page tree.
* Rich editor.
* Comments.
* Basic search.
* Basic roles.
* Page history.

#### UX/UI Requirements

* Clean app shell.
* Fast page creation.
* Clear sidebar navigation.
* Simple editor empty state.

#### Technical Notes

* Prioritize data model stability.
* Build permission foundations early.
* Avoid overbuilding enterprise features before core UX is stable.

#### Test Cases

* Create workspace.
* Create space.
* Create page.
* Edit page.
* Search page.
* Comment on page.

---

## 27.3 Epic: Phase 2 — Collaboration and Content Quality

### Feature 27.3.1: Team Collaboration Layer

#### Use Cases

* Multiple users edit documentation during a meeting.
* Reviewer comments on a draft.
* Team uses templates for repeatable docs.

#### User Stories

* As a team member, I want real-time editing so that collaboration is faster.
* As a reviewer, I want inline comments so that feedback is contextual.
* As a contributor, I want templates so that pages are consistent.

#### Acceptance Criteria

* Real-time collaboration works.
* Inline/page comments work.
* Comment resolution works.
* Templates can be created and used.
* Diagrams can be inserted.
* Notifications are delivered.

#### Functional Requirements

* Yjs/Hocuspocus collaboration.
* Presence/cursors.
* Inline comments.
* Comment resolution.
* Templates.
* Diagrams.
* Notifications.
* Markdown/HTML import/export.

#### UX/UI Requirements

* Collaborative cursors should be clear.
* Comment sidebar should be usable.
* Template gallery should be easy to browse.

#### Technical Notes

* Collaboration persistence must be reliable.
* Notification preferences should avoid noise.

#### Test Cases

* Two users edit same page.
* User creates inline comment.
* Comment is resolved.
* Page created from template.

---

## 27.4 Epic: Phase 3 — Business and Enterprise Security

### Feature 27.4.1: Security and Access Controls

#### Use Cases

* Company requires SSO.
* Admin restricts sensitive pages.
* Public sharing must be controlled.
* Audit logs are required for compliance.

#### User Stories

* As an IT admin, I want SSO so that users authenticate with company identity.
* As a security owner, I want page restrictions so that sensitive content is protected.
* As a compliance owner, I want audit logs so that changes are traceable.

#### Acceptance Criteria

* SSO works.
* MFA works.
* API keys are manageable.
* Page-level permissions work.
* Public sharing controls work.
* Audit logs record sensitive actions.

#### Functional Requirements

* SSO.
* MFA.
* API keys.
* Page-level permissions.
* Public sharing controls.
* Export permission control.
* Audit log foundation.
* Retention controls foundation.

#### UX/UI Requirements

* Security settings must be understandable.
* Permission management must explain access sources.
* Dangerous actions require confirmation.

#### Technical Notes

* Server-side authorization must be complete before public sharing and AI expansion.
* Audit event schema should be stable.

#### Test Cases

* Login with SSO.
* Enable MFA.
* Restrict page.
* Public sharing disabled blocks link.
* Permission change creates audit event.

---

## 27.5 Epic: Phase 4 — AI Knowledge Layer

### Feature 27.5.1: Secure AI Over Workspace Knowledge

#### Use Cases

* Employee asks AI a question about company process.
* Writer improves documentation using AI Assistant.
* AI Chat creates draft page.
* Admin monitors AI usage.

#### User Stories

* As an employee, I want AI answers with citations so that I can find knowledge quickly.
* As a writer, I want AI to improve text so that documentation quality increases.
* As an admin, I want AI permissions and usage controls so that AI is safe and cost-controlled.

#### Acceptance Criteria

* AI Assistant works in editor.
* AI Search returns cited answers.
* AI Chat supports multi-turn conversations.
* AI retrieval is permission-aware.
* AI feedback is captured.
* AI usage is tracked.

#### Functional Requirements

* AI provider settings.
* AI Assistant actions.
* AI Search.
* AI Chat.
* Page mentions.
* Tool calling.
* Permission-aware RAG.
* AI feedback.
* AI usage analytics.
* Rate limits.

#### UX/UI Requirements

* AI answers show sources.
* AI actions allow accept/reject.
* Low-confidence answers show warning.
* AI settings explain privacy behavior.

#### Technical Notes

* Retrieval filtering must be enforced before generation.
* Avoid relying on prompt instructions for security.
* AI logs must obey retention settings.

#### Test Cases

* AI answer includes citations.
* AI excludes restricted page.
* AI Assistant improves selected text.
* AI Chat cannot update page without edit permission.

---

## 27.6 Epic: Phase 5 — Migration and Integrations

### Feature 27.6.1: Migration and Connected Workflows

#### Use Cases

* Customer migrates from Confluence.
* Engineering imports GitHub docs.
* API team generates docs from OpenAPI.
* Team receives Slack notifications.

#### User Stories

* As an admin, I want import tools so that migration is easy.
* As an engineer, I want repository docs connected so that documentation stays near code.
* As a product manager, I want Jira integration so that work and docs stay connected.

#### Acceptance Criteria

* Confluence import works.
* Notion/DOCX import works.
* Repository docs import works.
* OpenAPI generator works.
* Slack/Teams notifications work.
* Jira/webhooks work.

#### Functional Requirements

* Confluence import.
* Notion import.
* DOCX import.
* GitHub/GitLab/Bitbucket import.
* OpenAPI generator.
* Jira integration.
* Slack/Teams integration.
* Webhooks.
* Automation API.

#### UX/UI Requirements

* Import wizards.
* Integration marketplace.
* Connection status.
* Error reports.

#### Technical Notes

* Provider tokens encrypted.
* Import jobs queued.
* Sync conflicts handled safely.

#### Test Cases

* Import Confluence ZIP.
* Import OpenAPI spec.
* Connect Slack and send notification.
* Create Jira issue from comment.

---

## 27.7 Epic: Phase 6 — Governance and Intelligence

### Feature 27.7.1: Documentation Governance Layer

#### Use Cases

* Critical policy requires approval.
* Expired page needs review.
* Knowledge manager finds missing docs.
* Expert corrects AI answer.

#### User Stories

* As a knowledge manager, I want health scores so that I know what to fix.
* As a compliance owner, I want page verification so that critical pages are reviewed.
* As an expert, I want to add insights so that AI answers improve.

#### Acceptance Criteria

* Page verification works.
* Health score is calculated.
* Knowledge gaps are detected.
* Expert insights can be added.
* Governance actions create tasks or notifications.

#### Functional Requirements

* Page verification.
* QMS approval workflow.
* Documentation Health Center.
* Knowledge Gap Detection.
* Expert Insights.
* Content freshness policies.
* Ownership governance.
* Advanced analytics.

#### UX/UI Requirements

* Health dashboard with actionable recommendations.
* Verification badge and workflow UI.
* Expert insights clearly separated from AI answer.

#### Technical Notes

* Health calculations run in background jobs.
* Gap detection combines search, AI feedback, comments, and metadata.

#### Test Cases

* Submit page for approval.
* Page expires and owner is notified.
* Failed search creates gap signal.
* Expert insight appears under AI answer.

---

## 27.8 Epic: Phase 7 — External Knowledge Experience

### Feature 27.8.1: Public and Guest Documentation

#### Use Cases

* Product team publishes public docs.
* Client accesses project space as guest.
* Customer searches public docs.
* Public AI answers customer questions.

#### User Stories

* As a product owner, I want public docs so that customers can self-serve.
* As an admin, I want guest access so that external collaboration is controlled.
* As a customer, I want public search and AI answers so that I find help quickly.

#### Acceptance Criteria

* Public docs portal works.
* Guest access is scoped.
* Custom domains work where configured.
* Public search uses only public content.
* Public AI uses only public content.
* External access overview shows exposure.

#### Functional Requirements

* Public docs portal.
* Public search.
* Public AI Search.
* Guest users.
* Guest expiration.
* Custom domains.
* Public feedback.
* SEO controls.
* External access overview.

#### UX/UI Requirements

* Public docs should be polished and branded.
* Guest badge should be visible.
* Admin external access console should highlight risks.

#### Technical Notes

* Public DTOs must be separate.
* Public AI corpus must be isolated.
* Public routes must avoid internal metadata.

#### Test Cases

* Publish space publicly.
* Guest cannot access unrelated space.
* Public AI excludes private content.
* Custom domain routes public docs correctly.

---

## 27.9 Epic: Phase 8 — Enterprise Operations and Scale

### Feature 27.9.1: Enterprise Operational Readiness

#### Use Cases

* Enterprise deploys in Kubernetes.
* Customer runs air-gapped deployment.
* IT automates user lifecycle with SCIM.
* Admin generates diagnostics bundle.

#### User Stories

* As an enterprise admin, I want SCIM so that user lifecycle is automated.
* As a security owner, I want air-gapped deployment so that no external calls are required.
* As a DevOps engineer, I want operational diagnostics so that support is faster.

#### Acceptance Criteria

* SCIM works.
* Air-gapped mode works.
* Kubernetes deployment is documented.
* Backup/restore documentation exists.
* Diagnostics are available.
* Data controls are documented.

#### Functional Requirements

* SCIM provisioning.
* Air-gapped mode.
* Kubernetes/Helm support.
* Diagnostics bundle.
* Backup/restore guide.
* Data residency controls.
* Advanced usage metering.
* Integration governance.

#### UX/UI Requirements

* System health page.
* Diagnostics download.
* Enterprise settings clearly grouped.

#### Technical Notes

* Avoid external dependencies in air-gapped mode.
* SCIM endpoints must be standards-compliant.
* Operational docs must be maintained with each release.

#### Test Cases

* SCIM creates/deactivates user.
* Air-gapped test detects no external calls.
* Kubernetes deployment passes smoke tests.
* Restore backup in staging.

---

# 28. Product Area: Final Product Positioning

## 28.1 Product Area Overview

Final Product Positioning defines how ConqrAI Wiki should be described to customers, investors, technical stakeholders, and internal teams.

The strongest position is not “another wiki.” The strongest position is:

> **A governed AI knowledge operating system for company documentation.**

---

## 28.2 Epic: Positioning Strategy

### Feature 28.2.1: Core Positioning Statement

#### Use Cases

* Website hero section.
* Investor pitch.
* Sales deck.
* Product documentation intro.
* Internal team alignment.

#### User Stories

* As a founder, I want a clear positioning statement so that the team communicates consistently.
* As a marketer, I want concise messaging so that the website explains the product quickly.
* As a sales person, I want enterprise-ready positioning so that customers understand the value.

#### Acceptance Criteria

* Positioning explains the category.
* Positioning explains the core value.
* Positioning differentiates from traditional wikis.
* Positioning is understandable to technical and non-technical audiences.

#### Functional Requirements

Positioning should communicate:

* Collaborative documentation.
* AI-powered knowledge discovery.
* Human-in-the-loop validation.
* Enterprise security.
* Documentation governance.
* Knowledge health intelligence.
* Self-hosted/cloud readiness.

#### UX/UI Requirements

* Website headline should be short.
* Product docs intro should be more complete.
* Sales version should emphasize business outcomes.

#### Technical Notes

* Positioning should match actual roadmap and capabilities.
* Avoid claiming features as available before release.

#### Test Cases

* Non-technical user understands the product in under 30 seconds.
* Technical user understands architecture value.
* Enterprise buyer recognizes security/compliance value.

---

### Feature 28.2.2: Value Proposition by Persona

#### Use Cases

* Website persona sections.
* Sales discovery.
* Product onboarding.
* Pricing page.

#### User Stories

* As an employee, I want to know how the product helps me find answers.
* As a contributor, I want to know how the product helps me write docs.
* As an admin, I want to know how the product protects company knowledge.
* As a knowledge manager, I want to know how the product improves documentation quality.

#### Acceptance Criteria

* Each persona has a clear value proposition.
* Messaging is specific and outcome-driven.
* Claims are aligned with product capabilities.

#### Functional Requirements

Persona value propositions:

* Employees: find trusted answers faster.
* Contributors: create better docs faster.
* Knowledge managers: maintain quality and governance.
* Engineers: document systems, APIs, runbooks, and incidents.
* Admins: control access, compliance, and deployment.
* External users: access clean, safe public/client docs.

#### UX/UI Requirements

* Use persona cards or sections.
* Keep each value proposition concise.
* Link persona needs to product features.

#### Technical Notes

* Not applicable.

#### Test Cases

* Persona messaging maps to features.
* No persona section overpromises unavailable features.

---

## 28.3 Epic: Competitive Differentiation

### Feature 28.3.1: Differentiation Against Existing Tools

#### Use Cases

* Customer compares against Confluence.
* Startup compares against Notion.
* Developer team compares against GitBook.
* Enterprise compares against Glean or Guru.

#### User Stories

* As a buyer, I want to understand why ConqrAI Wiki is different so that I can justify switching.
* As a founder, I want a clear competitive narrative so that the product is not seen as a commodity wiki.

#### Acceptance Criteria

* Differentiation is clear and credible.
* Competitor comparisons focus on product strengths without false claims.
* Messaging highlights AI, governance, and self-hosted readiness.

#### Functional Requirements

Comparison dimensions:

* Collaborative editing.
* AI Search with citations.
* Human expert validation.
* Documentation health.
* Page verification.
* Enterprise permissions.
* Public docs.
* Developer integrations.
* Self-hosted/air-gapped support.

#### UX/UI Requirements

* Use comparison tables carefully.
* Avoid aggressive or unsupported claims.
* Focus on “best fit” scenarios.

#### Technical Notes

* Competitor claims should be periodically reviewed.
* Public-facing claims should be verified before publishing.

#### Test Cases

* Comparison table matches actual features.
* No unsupported legal/competitive claims.

---

## 28.4 Epic: Messaging Library

### Feature 28.4.1: Headlines and Descriptions

#### Use Cases

* Website hero.
* LinkedIn announcement.
* Product documentation intro.
* Pitch deck.
* Sales email.

#### User Stories

* As a marketer, I want reusable messaging so that communication is consistent.
* As a founder, I want multiple message options so that I can test positioning.

#### Acceptance Criteria

* Messaging includes short, medium, and long versions.
* Messaging covers AI, governance, collaboration, and enterprise security.
* Messaging avoids jargon where audience is non-technical.

#### Functional Requirements

Short headline options:

* “Your company knowledge, trusted by humans and accelerated by AI.”
* “The governed AI wiki for modern teams.”
* “AI-powered documentation your company can trust.”
* “Turn company knowledge into a verified AI operating system.”

Medium description:

* “ConqrAI Wiki helps teams create, organize, search, verify, and continuously improve company documentation with AI-powered answers, real-time collaboration, and enterprise governance.”

Long description:

* “ConqrAI Wiki is an AI-powered collaborative documentation and knowledge governance platform that helps organizations centralize internal expertise, technical documentation, policies, and operational processes into trusted, searchable, verified, and continuously improved knowledge systems.”

#### UX/UI Requirements

* Website hero should use short headline.
* Product docs should use medium/long description.
* Enterprise sales deck should include governance and security language.

#### Technical Notes

* Messaging should evolve as product capabilities ship.

#### Test Cases

* Messaging used consistently across docs, website, and sales material.
* Claims align with actual release stage.

---

# 29. Product Area: Future Innovation Extensions

## 29.1 Product Area Overview

Future Innovation Extensions define advanced modules that can differentiate ConqrAI Wiki after the core enterprise product is stable. These features are not required for MVP but represent long-term strategic opportunities.

---

## 29.2 Epic: Knowledge Graph and Semantic Intelligence

### Feature 29.2.1: Company Knowledge Graph

#### Use Cases

* User wants all pages related to a system.
* Engineer wants to understand dependencies between services and runbooks.
* AI Search needs better context.
* Knowledge manager wants to detect disconnected documentation.

#### User Stories

* As a user, I want related pages suggested automatically so that I discover important context.
* As an engineer, I want relationships between services, APIs, repositories, and runbooks so that impact is clear.
* As a knowledge manager, I want semantic connections so that documentation quality improves.

#### Acceptance Criteria

* System extracts entities from pages.
* System maps relationships between pages, systems, APIs, people, teams, and repositories.
* Graph results are permission-aware.
* Graph improves recommendations and AI retrieval.

#### Functional Requirements

* Entity extraction.
* Relationship extraction.
* Explicit link graph.
* Semantic similarity graph.
* Related pages sidebar.
* Entity profile pages.
* Graph-based impact analysis.
* Permission-aware graph traversal.

#### UX/UI Requirements

* Show “Related Knowledge” in page sidebar.
* Explain why an item is related.
* Graph visualization should be optional.
* Avoid overwhelming normal readers.

#### Technical Notes

* Start with relational metadata and embeddings.
* Dedicated graph database can be considered later.
* Store edge type, confidence, source, and timestamp.
* Run graph computation asynchronously.

#### Test Cases

* Related page appears through shared entity.
* Restricted related page is hidden.
* AI uses graph context only from accessible pages.
* Impact analysis finds pages mentioning changed API.

---

## 29.3 Epic: Documentation Workflow Automation

### Feature 29.3.1: No-Code Documentation Automation Rules

#### Use Cases

* Expired page creates a task for owner.
* Public link in sensitive space notifies security.
* Negative AI feedback creates a knowledge gap.
* Failed search creates suggested page.

#### User Stories

* As an admin, I want automation rules so that governance actions happen automatically.
* As a knowledge manager, I want expired pages to create tasks so that follow-up is not manual.
* As a security owner, I want risky sharing events to trigger alerts.

#### Acceptance Criteria

* Admin can create trigger/action rules.
* Rules can be enabled or disabled.
* Rule executions are logged.
* Failed actions are visible.
* Automation respects permissions.

#### Functional Requirements

Triggers:

* Page created.
* Page updated.
* Page expired.
* Comment created.
* Comment unresolved for X days.
* Public link created.
* AI negative feedback.
* Search no results.
* Review requested.

Actions:

* Create task.
* Send notification.
* Assign owner.
* Request review.
* Add tag.
* Send webhook.
* Post Slack/Teams message.

#### UX/UI Requirements

* No-code rule builder.
* Plain-language summary.
* Execution history.
* Test rule button.

#### Technical Notes

* Use event bus and queue.
* Prevent infinite loops.
* Add execution limits and rate limits.

#### Test Cases

* Expired page triggers task.
* Disabled rule does not run.
* Failed action appears in log.
* Public link rule sends security notification.

---

## 29.4 Epic: Intelligent Onboarding Paths

### Feature 29.4.1: Role-Based Learning and Knowledge Paths

#### Use Cases

* New engineer needs engineering onboarding docs.
* New salesperson needs sales enablement docs.
* New client needs project onboarding docs.
* Compliance auditor needs selected evidence pages.

#### User Stories

* As a new employee, I want a guided knowledge path so that I know what to read first.
* As a manager, I want to assign onboarding paths so that new hires ramp faster.
* As a knowledge manager, I want completion tracking so that required reading is visible.

#### Acceptance Criteria

* Admins/managers can create knowledge paths.
* Paths contain ordered pages and tasks.
* Users can mark items complete.
* Completion is visible to assigned manager/admin.
* Access permissions are respected.

#### Functional Requirements

* Create knowledge path.
* Add pages to path.
* Add tasks/checkpoints.
* Assign to users/groups.
* Track progress.
* Send reminders.
* Recommend paths based on role/group.

#### UX/UI Requirements

* Learning path view with progress bar.
* Clear next item.
* Completion state.
* Manager overview.

#### Technical Notes

* Paths are workspace-scoped.
* Completion tracking should not bypass page permissions.

#### Test Cases

* Create onboarding path.
* Assign path to user.
* User completes page.
* Manager sees progress.
* Restricted page excluded for user without access.

---

# 30. Product Area: Final Implementation Checklist

## 30.1 Product Area Overview

The Final Implementation Checklist gives the team a practical readiness framework before launching ConqrAI Wiki to internal users, beta customers, or enterprise customers.

---

## 30.2 Epic: MVP Launch Checklist

### Feature 30.2.1: MVP Readiness

#### Use Cases

* Team prepares first internal launch.
* Product owner checks whether core workflows are complete.
* QA validates product before beta release.

#### User Stories

* As a product owner, I want a launch checklist so that we do not miss critical items.
* As an engineer, I want clear readiness criteria so that scope is controlled.
* As a QA owner, I want test coverage requirements so that quality is measurable.

#### Acceptance Criteria

* Core user workflows are complete.
* Critical bugs are resolved or documented.
* Security basics are tested.
* Deployment path is documented.
* Feedback mechanism exists.

#### Functional Requirements

MVP checklist:

* Authentication works.
* Workspace creation works.
* Space creation works.
* Page CRUD works.
* Rich editor works.
* Page tree works.
* Comments work.
* Search works.
* Basic permissions work.
* Page history works.
* Basic import/export works.
* Deployment docs exist.
* Core tests pass.

#### UX/UI Requirements

* Core flows should be understandable without training.
* Empty states should guide users.
* Error states should be clear.

#### Technical Notes

* Avoid launching MVP with incomplete authorization.
* Logging and error reporting should exist before beta.

#### Test Cases

* Complete first-user flow.
* Create and edit documentation.
* Search and comment.
* Restrict access.
* Deploy from clean environment.

---

## 30.3 Epic: Enterprise Readiness Checklist

### Feature 30.3.1: Enterprise Launch Readiness

#### Use Cases

* Product is sold to first enterprise customer.
* Self-hosted customer requests production deployment.
* Security review is required.

#### User Stories

* As an enterprise admin, I want security and deployment documentation so that I can approve usage.
* As a sales engineer, I want readiness material so that enterprise onboarding is smoother.
* As a product owner, I want enterprise feature checklist so that commitments are clear.

#### Acceptance Criteria

* Enterprise security features are implemented or clearly roadmap-labeled.
* Deployment docs are complete.
* Backup/restore guidance exists.
* Audit and retention are available where promised.
* SSO/MFA are tested.

#### Functional Requirements

Enterprise checklist:

* SSO.
* MFA.
* SCIM, if sold.
* Audit logs.
* Retention controls.
* Page-level permissions.
* Public sharing controls.
* API keys.
* Backup/restore docs.
* System health.
* Diagnostics bundle.
* Air-gapped docs, if sold.
* Kubernetes docs, if sold.
* Security test suite.

#### UX/UI Requirements

* Admin settings should be polished.
* Security controls should include explanations.
* Enterprise locked/available states should
# ConqrAI Wiki — Continuation from Feature 29.4.1 to the End

## Document Purpose

This document continues the product documentation from:

**Feature 29.4.1: Role-Based Learning and Knowledge Paths**

It expands the remaining future innovation, implementation readiness, operational rollout, success metrics, go-to-market enablement, and final delivery checklist sections.

Structure used:

**Product Area → Epic → Feature → Use Cases → User Stories → Acceptance Criteria → Functional Requirements → UX/UI Requirements → Technical Notes → Test Cases**

---

# 29.4 Epic: Intelligent Onboarding Paths

## Feature 29.4.1: Role-Based Learning and Knowledge Paths

### Use Cases

* A new engineer joins the company and needs a guided path through engineering onboarding, architecture overview, coding standards, deployment flow, incident process, and team rituals.
* A new salesperson needs to learn product positioning, pricing, objection handling, CRM process, sales playbook, and customer case studies.
* A new customer success manager needs to learn onboarding processes, support escalation, customer health metrics, and internal knowledge sources.
* A new client receives a project-specific onboarding path with selected external documentation.
* A compliance auditor receives a limited path containing only evidence pages, policies, and approval records.
* A contractor receives temporary access to a learning path with required security and workflow documentation.

### User Stories

* As a new employee, I want a guided learning path so that I know exactly what to read first.
* As a manager, I want to assign onboarding paths so that new hires ramp up faster.
* As a knowledge manager, I want standardized onboarding paths so that onboarding does not depend only on individual managers.
* As an admin, I want learning paths to respect permissions so that users only see content they are allowed to access.
* As an external guest, I want a simple onboarding path so that I can understand the project without seeing internal company knowledge.
* As a compliance owner, I want completion tracking so that required reading can be verified.

### Acceptance Criteria

* Authorized users can create learning paths.
* A learning path can contain ordered pages, sections, tasks, quizzes, acknowledgements, and external links.
* Learning paths can be assigned to users or groups.
* Users can track their progress.
* Managers/admins can view completion status for assigned users.
* Learning paths respect page, space, guest, and public sharing permissions.
* Users without access to a page do not see that page in the path, or see a safe access-required state depending on configuration.
* Learning path completion can generate audit or compliance events where required.

### Functional Requirements

#### Learning Path Creation

* Create learning path.
* Edit learning path.
* Delete/archive learning path.
* Add title.
* Add description.
* Add owner.
* Add target role/persona.
* Add estimated completion time.
* Add required/optional status.
* Add cover/icon.
* Add path category.

#### Path Content

* Add wiki page.
* Add external link.
* Add checklist item.
* Add file attachment.
* Add quiz/question, optional.
* Add acknowledgement step.
* Add AI-generated summary step.
* Add task/action step.
* Add completion requirement.

#### Assignment

* Assign to user.
* Assign to group.
* Assign to role.
* Assign to guest.
* Set due date.
* Send reminder.
* Reassign path.
* Remove assignment.

#### Progress Tracking

* Mark step as complete.
* Auto-complete when page viewed, optional.
* Track completion percentage.
* Track last activity.
* Track overdue status.
* Track acknowledgement.
* Export completion report, optional.

#### Governance

* Require path completion for certain roles.
* Link completion to audit logs.
* Notify manager when completed.
* Notify user when overdue.
* Refresh path when pages are updated, optional.

### UX/UI Requirements

#### Creator Experience

* Learning path builder should use a simple drag-and-drop sequence.
* Each path item should show type: page, task, quiz, external link, acknowledgement.
* The creator should see warnings if a path includes restricted pages.
* The builder should show estimated total reading time.
* The creator should preview the path as a learner.

#### Learner Experience

* Learning path should show a clear progress bar.
* Each step should show completion state.
* The next required item should be visually emphasized.
* Users should be able to resume where they stopped.
* Completed items should remain accessible.
* Mobile reading should be supported.

#### Manager/Admin Experience

* Managers should see assigned users and completion status.
* Admins should filter by role, group, due date, status, and overdue state.
* Export completion report should be available for compliance-oriented customers.

### Technical Notes

* Learning paths should be workspace-scoped.
* Path items should reference pages by ID, not by slug, to survive renames.
* Progress should be tracked per user and per path item.
* Permission checks must run when rendering a path and when opening each path item.
* For external guests, paths should be scoped to guest-accessible pages only.
* Completion events can feed audit logs and analytics.
* Avoid automatically marking a page complete if the user opened it for only one second; use configurable read-time threshold if auto-completion is implemented.

### Test Cases

#### Creation

* Create learning path with pages and tasks.
* Reorder path items.
* Add restricted page and show permission warning.
* Archive learning path.

#### Assignment

* Assign path to user.
* Assign path to group.
* Remove assignment.
* Due date reminder is sent.

#### Learner Progress

* User marks page step complete.
* Completion percentage updates.
* User resumes path from last incomplete step.
* Completed path appears in completed section.

#### Permissions

* User without access cannot open restricted path item.
* Guest sees only guest-accessible path content.
* Removed user loses path access.

#### Reporting

* Manager sees completion status.
* Overdue path appears in report.
* Completion export contains correct users and dates.

---

## Feature 29.4.2: AI-Generated Onboarding Paths

### Use Cases

* A manager wants to create an onboarding plan for a new data engineer using existing engineering documentation.
* A customer success lead wants an onboarding path for new clients based on public project docs.
* HR wants a standard company onboarding path for all employees.
* A team lead wants AI to suggest what a new joiner should read based on role, team, and available documentation.

### User Stories

* As a manager, I want AI to generate a learning path so that I do not need to manually search all relevant pages.
* As a knowledge manager, I want AI to suggest missing onboarding pages so that the path becomes complete.
* As a new employee, I want a role-specific path so that I do not waste time reading irrelevant documentation.
* As an admin, I want AI-generated paths to remain drafts until reviewed so that incorrect onboarding paths are not published automatically.

### Acceptance Criteria

* User can request AI to generate a path by role, team, goal, or project.
* AI suggests an ordered list of pages and tasks.
* AI explains why each page is included.
* AI only suggests pages the path creator is allowed to access.
* AI-generated paths are created as drafts.
* User can edit, remove, reorder, and approve AI suggestions before publishing.
* If important content is missing, AI suggests pages to create.

### Functional Requirements

* Generate path from role.
* Generate path from team/group.
* Generate path from selected space.
* Generate path from selected pages.
* Generate path from project description.
* Suggest missing pages.
* Suggest estimated reading time.
* Suggest required vs optional items.
* Explain each recommendation.
* Create draft path.
* Allow manual editing before publish.

### UX/UI Requirements

* AI path generator should use a guided form:

  * Role.
  * Team.
  * Objective.
  * Experience level.
  * Duration.
  * Required spaces.
* Generated path preview should be editable.
* Each suggestion should include a short reason.
* Missing documentation suggestions should be visually separated from existing page suggestions.

### Technical Notes

* Use permission-aware retrieval.
* Use page metadata, tags, ownership, health score, and analytics to rank recommendations.
* AI-generated paths should never auto-publish.
* Store generation prompt metadata for audit/observability if retention allows.

### Test Cases

* Generate onboarding path for “Backend Engineer.”
* AI suggests only accessible pages.
* AI-generated path is draft.
* User removes suggested item and publishes path.
* Missing page suggestion appears when relevant docs are absent.

---

## Feature 29.4.3: Certification and Required Reading

### Use Cases

* Security team requires all employees to read the information security policy.
* HR requires employees to acknowledge updated workplace policy.
* Engineering requires on-call engineers to complete incident response training.
* Compliance team needs proof that employees read critical procedures.

### User Stories

* As a compliance owner, I want required reading assignments so that critical policies are acknowledged.
* As an employee, I want to know which required documents I must complete.
* As an admin, I want completion reports so that compliance evidence is available.
* As a manager, I want reminders for overdue required reading so that teams stay compliant.

### Acceptance Criteria

* Authorized users can mark learning paths or pages as required reading.
* Required reading can be assigned to users/groups.
* Users can acknowledge completion.
* Completion timestamp is recorded.
* Admins can export completion reports.
* Updated policy can require re-acknowledgement.

### Functional Requirements

* Mark page/path as required.
* Assign required reading.
* Set due date.
* Require acknowledgement checkbox.
* Require quiz pass, optional.
* Track completion timestamp.
* Track re-acknowledgement after update.
* Send reminders.
* Export compliance report.
* Audit completion events.

### UX/UI Requirements

* Required reading should appear in My Work.
* Required documents should show a clear acknowledgement section.
* Users should see due date and overdue state.
* Admin report should support filtering by user, group, path, completion status, and date.

### Technical Notes

* Acknowledgement should be immutable or audit logged.
* If page content changes materially, system can require re-acknowledgement.
* Store version ID acknowledged by user.

### Test Cases

* Assign required reading to group.
* User acknowledges page.
* Completion timestamp is saved.
* Page update requires re-acknowledgement when configured.
* Export report includes completion status.

---

# 29.5 Epic: Intelligent Knowledge Recommendations

## Feature 29.5.1: Personalized Knowledge Feed

### Use Cases

* User sees recently updated pages relevant to their team.
* New employee sees onboarding recommendations.
* Engineer sees documentation updates related to services they work on.
* Manager sees pages awaiting review or ownership.

### User Stories

* As a user, I want a personalized knowledge feed so that I stay informed without searching manually.
* As a manager, I want relevant documentation updates for my team so that I can monitor changes.
* As a knowledge manager, I want important updates to reach the right audience.

### Acceptance Criteria

* Users see recommended pages based on role, groups, spaces, recently viewed content, assignments, and permissions.
* Feed excludes inaccessible content.
* Users can dismiss recommendations.
* Users can provide feedback to improve recommendations.

### Functional Requirements

* Recommended recently updated pages.
* Recommended onboarding pages.
* Recommended pages from followed spaces.
* Recommended pages requiring review.
* Recommended pages related to user’s work.
* Dismiss recommendation.
* Mark recommendation as useful/not useful.
* Follow/unfollow spaces or tags.

### UX/UI Requirements

* Feed can appear on dashboard/homepage.
* Recommendations should include explanation:

  * “Updated in a space you follow.”
  * “Assigned to your group.”
  * “Related to pages you viewed.”
* Keep feed concise and filterable.

### Technical Notes

* Use permissions as a hard filter.
* Use analytics, group membership, tags, and graph relationships for ranking.
* Avoid over-personalization that feels invasive.

### Test Cases

* User sees update from followed space.
* Restricted page not recommended.
* User dismisses recommendation.
* Feedback changes future ranking signal.

---

## Feature 29.5.2: Expert Recommendation

### Use Cases

* User reads an AI answer and needs to ask the right expert.
* New employee needs to know who owns a system.
* Knowledge manager wants to identify experts for page review.

### User Stories

* As a user, I want to know who the expert is so that I can ask the right person.
* As a knowledge manager, I want recommended reviewers so that pages are validated by the right people.
* As an admin, I want expert recommendations based on ownership and contribution history.

### Acceptance Criteria

* System recommends experts based on page ownership, edit history, expert insights, group membership, and related pages.
* Recommendations respect privacy and permissions.
* Users can contact or mention recommended experts.
* Experts can opt out or admins can control visibility, optional.

### Functional Requirements

* Recommend page owner.
* Recommend frequent contributors.
* Recommend verified experts.
* Recommend group/team owner.
* Recommend reviewer for page verification.
* Mention expert.
* Request expert insight.

### UX/UI Requirements

* Show “Ask an expert” section on page or AI answer.
* Show reason for recommendation:

  * “Owner of this page.”
  * “Frequently edits related pages.”
  * “Verified expert in Security.”
* Avoid exposing sensitive profile data.

### Technical Notes

* Ranking can use page ownership, contribution history, group role, and expert insight metadata.
* Respect user visibility settings.

### Test Cases

* Page owner appears as recommended expert.
* Frequent contributor appears.
* User without access to page cannot see expert recommendation for that page.
* Request expert insight sends notification.

---

# 30. Product Area: Final Implementation Checklist

## 30.1 Product Area Overview

The Final Implementation Checklist provides a practical readiness framework before launching ConqrAI Wiki internally, to beta customers, or to enterprise customers.

This area turns the product specification into execution gates. Each gate defines what must be complete before the product can be considered ready for a specific launch stage.

---

## 30.2 Epic: MVP Launch Readiness

## Feature 30.2.1: MVP Functional Checklist

### Use Cases

* Team prepares first internal launch.
* Founder validates whether the product is usable by a small team.
* QA validates core flows before beta.
* Engineering team decides what is blocking MVP release.

### User Stories

* As a product owner, I want a launch checklist so that we do not miss critical features.
* As an engineer, I want clear readiness criteria so that the MVP scope is controlled.
* As a QA owner, I want required test coverage so that quality is measurable.
* As a founder, I want a simple go/no-go view so that launch decisions are objective.

### Acceptance Criteria

* Core user workflows are complete.
* Critical bugs are resolved or explicitly accepted.
* Security basics are tested.
* Deployment path is documented.
* Feedback mechanism exists.
* MVP can be used by a small real team to create, organize, search, and collaborate on documentation.

### Functional Requirements

MVP functional checklist:

* User authentication works.
* Workspace creation works.
* User invitation works.
* Space creation works.
* Page creation works.
* Page editing works.
* Rich editor supports core blocks.
* Page tree supports hierarchy.
* Comments work.
* Basic search works.
* Basic permissions work.
* Page history works.
* Trash/restore works.
* Basic templates work.
* Basic import/export works.
* Notifications work for mentions/comments.
* Basic admin settings work.

### UX/UI Requirements

* First-time user can create first page without training.
* Empty states explain what to do next.
* Main sidebar and page tree are understandable.
* Editor interactions feel stable.
* Error states are clear.
* Loading states exist for async operations.

### Technical Notes

* Avoid launching MVP with incomplete backend authorization.
* Avoid launching with known data-loss bugs in editor/collaboration.
* Logging should exist before beta.
* Database migrations should be tested from clean install.

### Test Cases

* New user creates workspace.
* Admin invites second user.
* User creates space and page.
* User edits page and saves content.
* User searches for page.
* User comments on page.
* Admin restricts access to a private space.
* Deleted page can be restored.

---

## Feature 30.2.2: MVP Technical Readiness Checklist

### Use Cases

* Engineering team prepares deployable build.
* DevOps validates deployment commands.
* QA validates migration and database setup.

### User Stories

* As a DevOps engineer, I want deployment readiness criteria so that the product can run reliably.
* As a backend engineer, I want database migration readiness so that installs and upgrades work.
* As a maintainer, I want CI quality gates so that regressions are caught.

### Acceptance Criteria

* Application builds successfully.
* Database migrations run successfully.
* Docker/local deployment works.
* Required environment variables are documented.
* CI pipeline passes.
* Core tests pass.

### Functional Requirements

Technical checklist:

* `pnpm install` works.
* `pnpm run build` works.
* Client build works.
* Server build works.
* Unit tests pass.
* Integration tests pass.
* Lint passes.
* Format check passes.
* Migration up works.
* Migration codegen works.
* Docker Compose starts required infrastructure.
* Environment validation works.
* Health endpoint exists.

### UX/UI Requirements

* Admin/system errors should be readable.
* Setup documentation should be copy-paste friendly.

### Technical Notes

* Use seed data for test environments.
* Keep required services minimal for MVP: PostgreSQL and Redis.
* Optional services should fail gracefully.

### Test Cases

* Clean install works from README commands.
* Build completes in CI.
* Migration runs on empty database.
* Server fails gracefully with missing required env var.
* Health endpoint reports DB/Redis status.

---

## Feature 30.2.3: MVP Security Readiness Checklist

### Use Cases

* Product is exposed to first real users.
* Workspace contains internal company documentation.
* Admin needs confidence that private spaces are protected.

### User Stories

* As a security owner, I want security basics verified before launch.
* As an admin, I want private content protected from unauthorized users.
* As a user, I want account and page access to be secure.

### Acceptance Criteria

* Protected endpoints require authentication.
* Space permissions are enforced server-side.
* Page read/write actions are authorized.
* Search respects permissions.
* Public sharing, if included in MVP, does not expose internal data.
* Secrets are not logged.

### Functional Requirements

Security checklist:

* Authentication required for protected API.
* Secure password hashing.
* Secure session/JWT cookie settings.
* CSRF strategy where applicable.
* Rate limiting for login.
* Server-side permission checks.
* Permission-aware search.
* Safe public DTOs if public sharing exists.
* Secret redaction in logs.

### UX/UI Requirements

* Unauthorized users see safe access denied state.
* Login errors do not leak whether account exists.
* Admin sees clear permission settings.

### Technical Notes

* Perform direct API authorization tests, not only UI tests.
* Validate public routes separately from internal routes.

### Test Cases

* Unauthenticated protected request fails.
* Reader cannot edit page.
* User cannot access private space.
* Search excludes private page.
* Secret values not printed in logs.

---

## 30.3 Epic: Business Launch Readiness

## Feature 30.3.1: Business Tier Readiness Checklist

### Use Cases

* First paying business customer wants SSO and AI Search.
* Company wants to migrate from Confluence.
* Customer wants public sharing controls and PDF export.

### User Stories

* As a business customer, I want security and productivity features so that the product fits my team.
* As a founder, I want a checklist for paid plan readiness so that I do not sell unstable features.
* As a customer success manager, I want onboarding readiness so that adoption is smooth.

### Acceptance Criteria

* Business-tier features are implemented, tested, and documented.
* Feature gating works.
* Migration/import paths are reliable enough for customer use.
* AI features have clear privacy and permission behavior.

### Functional Requirements

Business checklist:

* SSO configured and tested.
* MFA configured and tested.
* API keys implemented.
* Page-level permissions implemented.
* Public sharing controls implemented.
* Remove public branding implemented if sold.
* Templates implemented.
* Comment resolution implemented.
* PDF export implemented.
* DOCX import implemented.
* Notion/Confluence import implemented.
* Typesense search implemented.
* Attachment indexing implemented.
* AI Search implemented.
* AI Assistant implemented.
* MCP implemented if included in Business.
* Air-gapped deployment documented if included.
* Email support process ready.

### UX/UI Requirements

* Business locked/unlocked states are clear.
* Settings pages explain SSO, MFA, API keys, public sharing, AI, and import/export.
* Import and export progress UIs are user-friendly.

### Technical Notes

* Do not rely on client feature gating only.
* Feature matrix must match actual entitlements.
* AI and import jobs should run in background queues.

### Test Cases

* Business license unlocks Business features.
* SSO login works.
* MFA enforcement works.
* PDF export works.
* Confluence import creates pages.
* AI Search excludes restricted page.

---

## 30.4 Epic: Enterprise Launch Readiness

## Feature 30.4.1: Enterprise Security and Compliance Checklist

### Use Cases

* Enterprise customer requires audit logs and retention controls.
* IT requires SCIM provisioning.
* Compliance requires page verification workflow.
* Security team reviews deployment model.

### User Stories

* As an enterprise admin, I want security and compliance controls so that the platform can be approved internally.
* As an IT owner, I want SCIM so that user lifecycle is automated.
* As a compliance owner, I want audit logs, retention, and verification so that governance requirements are met.
* As a security owner, I want air-gapped and self-hosted options so that deployment fits policy.

### Acceptance Criteria

* Enterprise-only features are implemented or clearly marked as roadmap if not yet available.
* SSO, MFA, SCIM, audit logs, retention, and page verification are tested.
* Air-gapped/self-hosted deployment documentation is complete if sold.
* Enterprise support and diagnostics process is ready.

### Functional Requirements

Enterprise checklist:

* SCIM provisioning.
* Audit logs.
* Retention controls.
* Page verification/QMS workflow.
* Guest users.
* Advanced security controls.
* Documentation Health Center.
* Knowledge Gap Detection.
* Advanced AI governance.
* Priority support process.
* Diagnostics bundle.
* Backup/restore documentation.
* Kubernetes/Helm documentation.
* Air-gapped documentation.

### UX/UI Requirements

* Enterprise settings should be clearly grouped.
* Audit log UI should be filterable and exportable if promised.
* Retention settings should explain consequences.
* Verification workflow should be clear to authors and approvers.

### Technical Notes

* Enterprise promises must match actual implementation.
* Security-sensitive features require strong automated tests.
* Enterprise deployments should have a documented support path.

### Test Cases

* SCIM creates, updates, and deactivates user.
* Audit event is created for permission change.
* Retention cleanup deletes old records according to policy.
* Page approval workflow completes.
* Air-gapped smoke test passes.
* Diagnostics bundle redacts secrets.

---

## Feature 30.4.2: Enterprise Documentation Pack

### Use Cases

* Customer security team asks for deployment architecture.
* IT team asks for SSO and SCIM setup guides.
* Compliance team asks for audit/retention documentation.
* DevOps asks for backup and restore guide.

### User Stories

* As an enterprise buyer, I want complete technical documentation so that internal approval is easier.
* As a customer IT admin, I want setup guides so that deployment is faster.
* As a sales engineer, I want standardized enterprise docs so that customer onboarding is repeatable.

### Acceptance Criteria

* Enterprise documentation pack exists.
* Documentation covers architecture, deployment, security, SSO, SCIM, backup, restore, and operations.
* Docs are versioned with product releases.
* Docs avoid unsupported claims.

### Functional Requirements

Enterprise docs pack:

* Architecture overview.
* Deployment guide.
* Docker guide.
* Kubernetes/Helm guide.
* Air-gapped guide.
* SSO setup guide.
* MFA guide.
* SCIM setup guide.
* Security model.
* Permission model.
* Backup/restore guide.
* Upgrade guide.
* Audit logs guide.
* Retention guide.
* AI governance guide.
* Troubleshooting guide.

### UX/UI Requirements

* Docs should be structured by audience:

  * IT admin.
  * Security team.
  * DevOps.
  * Knowledge manager.
  * End user.
* Include diagrams where helpful.
* Include copy-paste configuration examples.

### Technical Notes

* Docs must be maintained with every release.
* Each enterprise feature should have configuration and troubleshooting sections.

### Test Cases

* Follow SSO guide to configure provider.
* Follow backup guide to restore in staging.
* Follow air-gapped guide without internet.
* Validate docs match actual UI and commands.

---

# 31. Product Area: Launch Operations and Rollout

## 31.1 Product Area Overview

Launch Operations and Rollout define how ConqrAI Wiki is introduced to users and customers. A successful product launch is not only a technical release; it includes onboarding, communication, migration, training, support readiness, and feedback collection.

---

## 31.2 Epic: Internal Rollout

## Feature 31.2.1: Internal Pilot Program

### Use Cases

* ConqrAI team uses the product internally first.
* Engineering team pilots technical documentation.
* HR pilots company handbook.
* Product team pilots PRDs and release notes.

### User Stories

* As a product owner, I want an internal pilot so that we validate the product before customers.
* As an internal user, I want a clear pilot scope so that I know what feedback is expected.
* As an engineer, I want real usage data so that product issues are discovered early.

### Acceptance Criteria

* Pilot workspace is created.
* Pilot users are selected.
* Pilot use cases are defined.
* Feedback collection process exists.
* Pilot success metrics are defined.

### Functional Requirements

* Create internal workspace.
* Create pilot spaces.
* Import initial docs.
* Invite pilot users.
* Enable feedback button.
* Track usage metrics.
* Track bugs and feature requests.
* Weekly pilot review.

### UX/UI Requirements

* Pilot users should see clear onboarding instructions.
* Feedback button should be easy to find.
* Known limitations should be communicated.

### Technical Notes

* Use internal pilot to validate deployment, editor, permissions, search, AI, and collaboration.
* Instrument core events before pilot.

### Test Cases

* Pilot user creates page.
* Pilot user submits feedback.
* Pilot metrics are visible.
* Critical bug is tracked from feedback to fix.

---

## Feature 31.2.2: Beta Customer Rollout

### Use Cases

* First external customer tests the product.
* Customer imports a small documentation set.
* Customer tests SSO and permissions.
* Customer evaluates AI Search.

### User Stories

* As a founder, I want a controlled beta rollout so that risk is managed.
* As a beta customer, I want clear setup support so that I can evaluate the product.
* As a customer success manager, I want beta feedback so that onboarding improves.

### Acceptance Criteria

* Beta eligibility criteria are defined.
* Beta onboarding guide exists.
* Support process exists.
* Feedback and bug tracking exist.
* Beta success metrics are measured.

### Functional Requirements

* Beta workspace setup.
* Customer onboarding checklist.
* Migration support.
* SSO setup support.
* AI configuration support.
* Weekly check-in process.
* Feedback tracking.
* Beta issue priority process.

### UX/UI Requirements

* Beta onboarding should be guided.
* Product should clearly indicate beta features if unstable.
* Feedback and support links should be visible.

### Technical Notes

* Avoid onboarding beta customers with unsupported deployment requirements.
* Use feature flags for unstable features.
* Monitor logs closely during beta.

### Test Cases

* Customer completes onboarding checklist.
* Customer imports sample docs.
* Customer searches and uses AI Search.
* Feedback is captured and prioritized.

---

## 31.3 Epic: Customer Training and Enablement

## Feature 31.3.1: Training Materials

### Use Cases

* Admin needs to learn workspace setup.
* Employees need to learn page creation and search.
* Knowledge managers need to learn verification and health dashboards.
* IT needs to learn SSO/MFA/SCIM.

### User Stories

* As a customer admin, I want training materials so that I can launch internally.
* As an end user, I want short tutorials so that I can use the product quickly.
* As a knowledge manager, I want governance training so that documentation quality improves.

### Acceptance Criteria

* Training materials cover main personas.
* Materials include short guides and videos/scripts where possible.
* Materials are linked from onboarding and help center.
* Materials are updated with major releases.

### Functional Requirements

Training modules:

* Getting started.
* Creating spaces and pages.
* Using the editor.
* Search and AI Search.
* Comments and collaboration.
* Templates.
* Permissions.
* Public sharing.
* Admin settings.
* SSO/MFA/SCIM.
* Verification workflows.
* Documentation Health Center.

### UX/UI Requirements

* Training should be short and task-based.
* Provide checklists and examples.
* Use role-based learning paths inside ConqrAI Wiki itself.

### Technical Notes

* Training content can be used as default demo workspace content.
* Keep screenshots current with UI changes.

### Test Cases

* New user follows getting started guide and creates first page.
* Admin follows SSO guide and configures provider.
* Knowledge manager follows verification guide and verifies page.

---

# 32. Product Area: Success Metrics and KPIs

## 32.1 Product Area Overview

Success Metrics and KPIs define how the team measures whether ConqrAI Wiki is valuable, adopted, reliable, and commercially viable.

Metrics should be grouped into:

* Product usage.
* Documentation quality.
* AI quality.
* Collaboration.
* Enterprise readiness.
* Business growth.

---

## 32.2 Epic: Product Adoption Metrics

## Feature 32.2.1: Usage and Engagement KPIs

### Use Cases

* Founder tracks whether teams actually use the wiki.
* Product team identifies adoption bottlenecks.
* Customer success tracks customer health.

### User Stories

* As a product owner, I want adoption metrics so that I know if users get value.
* As a customer success manager, I want customer health signals so that I can intervene early.
* As an admin, I want workspace activity metrics so that I understand internal adoption.

### Acceptance Criteria

* Usage metrics are collected in a privacy-conscious way.
* Admins can view workspace-level metrics.
* Product team can evaluate adoption trends where allowed.
* Metrics are actionable.

### Functional Requirements

Adoption KPIs:

* Daily active users.
* Weekly active users.
* Monthly active users.
* Pages created.
* Pages edited.
* Searches performed.
* Comments created.
* AI questions asked.
* Templates used.
* Public links created.
* Import jobs completed.
* Time to first page.
* Time to first search.
* Time to first AI answer.

### UX/UI Requirements

* Admin dashboard should show simple activity trends.
* Product analytics should avoid overwhelming admins.
* Customer success view can show customer health score, if cloud/internal.

### Technical Notes

* Respect self-hosted and air-gapped analytics policies.
* Avoid collecting page content for analytics.
* Aggregate where possible.

### Test Cases

* Page creation increments metric.
* Search increments metric.
* AI question increments metric.
* Analytics disabled stops optional tracking.

---

## 32.3 Epic: Documentation Quality Metrics

## Feature 32.3.1: Knowledge Quality KPIs

### Use Cases

* Knowledge manager tracks documentation health.
* Admin measures outdated pages.
* Executive wants documentation maturity score.

### User Stories

* As a knowledge manager, I want quality metrics so that I can improve documentation.
* As a team lead, I want to know which spaces need attention.
* As an executive, I want a high-level health indicator so that knowledge risk is visible.

### Acceptance Criteria

* Documentation quality metrics are calculated.
* Metrics are available by workspace, space, owner, and tag.
* Metrics link to actionable pages.

### Functional Requirements

Quality KPIs:

* Documentation Health Score.
* Pages without owners.
* Pages not updated in X days.
* Expired pages.
* Unverified critical pages.
* Broken links.
* Duplicate pages.
* Unresolved comments.
* Failed searches.
* Low-confidence AI answers.
* Negative AI feedback.
* Required reading completion.

### UX/UI Requirements

* Use clear health score visual.
* Provide filters and drill-down.
* Show recommended actions.

### Technical Notes

* Calculate metrics through scheduled jobs.
* Store historical trends.
* Some metrics require AI/embedding analysis and should be optional.

### Test Cases

* Page without owner appears in metric.
* Expired page increases expired count.
* Fixing broken link improves score.
* Negative AI feedback creates quality signal.

---

## 32.4 Epic: AI Success Metrics

## Feature 32.4.1: AI Quality and ROI KPIs

### Use Cases

* Admin wants to know if AI Search is useful.
* Product team wants to improve retrieval quality.
* Finance wants to control AI cost.

### User Stories

* As an AI admin, I want AI quality metrics so that I can improve answers.
* As a finance owner, I want AI cost metrics so that usage is controlled.
* As a user, I want AI to improve over time based on feedback.

### Acceptance Criteria

* AI usage and feedback are tracked.
* Cost estimates are available.
* Low-quality answers are visible for improvement.
* AI metrics obey retention settings.

### Functional Requirements

AI KPIs:

* AI questions asked.
* AI answer helpful rate.
* No-answer rate.
* Low-confidence answer rate.
* Average retrieval score.
* Average answer latency.
* Token usage.
* Estimated cost.
* Top asked topics.
* Top failed topics.
* Most cited pages.
* Negative feedback by source page.

### UX/UI Requirements

* AI analytics dashboard.
* Filters by feature, model, user, space, date.
* Link feedback to source pages and knowledge gaps.

### Technical Notes

* Token/cost may be estimated depending on provider.
* Retention settings may delete detailed logs while keeping aggregated metrics.

### Test Cases

* AI request increments count and token usage.
* Helpful feedback updates helpful rate.
* No-answer case increments no-answer rate.
* Retention cleanup removes detailed logs.

---

# 33. Product Area: Final Risk Register

## 33.1 Product Area Overview

The risk register identifies major product, technical, security, operational, and business risks that could affect ConqrAI Wiki. Each risk should have mitigation and owner.

---

## 33.2 Epic: Product and Market Risks

## Feature 33.2.1: Product Risk Register

### Use Cases

* Product team prioritizes risk reduction.
* Founder prepares investor or partner presentation.
* Engineering team identifies high-risk implementation areas.

### User Stories

* As a founder, I want risk visibility so that we make better strategic decisions.
* As an engineer, I want known risks documented so that architecture choices address them.
* As a product owner, I want mitigations so that risk does not block launch.

### Acceptance Criteria

* Major risks are documented.
* Each risk has impact, probability, mitigation, and owner.
* High-risk items are reviewed regularly.

### Functional Requirements

Risk fields:

* Risk title.
* Category.
* Description.
* Impact.
* Probability.
* Severity.
* Mitigation.
* Owner.
* Status.
* Review date.

### UX/UI Requirements

* Risk register can be maintained as internal documentation or structured table.
* High severity risks should be visually highlighted.

### Technical Notes

* Risk register can be implemented as a template/page initially.
* Later it can become a structured governance module.

### Test Cases

* Risk register template exists.
* High-risk items have mitigation owner.
* Review date reminder can be created.

---

## 33.3 Key Risks and Mitigations

### Risk 1: Permission Complexity

* **Impact:** Users/admins may misunderstand who can access content.
* **Mitigation:** Access explanation, clear permission UI, permission matrix, strong tests.

### Risk 2: AI Trust and Hallucination

* **Impact:** Users may rely on incorrect AI answers.
* **Mitigation:** Citations, confidence/trust levels, no-answer behavior, feedback, expert insights.

### Risk 3: Public Sharing Leakage

* **Impact:** Sensitive content may be exposed externally.
* **Mitigation:** Public-safe DTOs, sharing controls, external access overview, audit logs, security tests.

### Risk 4: Migration Quality

* **Impact:** Customers may fail to migrate from Confluence/Notion due to formatting or hierarchy loss.
* **Mitigation:** Assessment, preview, error reports, rollback, customer success migration support.

### Risk 5: Performance at Scale

* **Impact:** Large workspaces may become slow.
* **Mitigation:** Lazy loading, indexing, background jobs, caching, performance tests.

### Risk 6: Integration Maintenance

* **Impact:** Third-party API changes can break integrations.
* **Mitigation:** Modular integration layer, provider mocks, monitoring, graceful errors.

### Risk 7: Self-Hosted Support Burden

* **Impact:** Many infrastructure variations increase support complexity.
* **Mitigation:** Diagnostics bundle, health checks, clear docs, supported deployment profiles.

### Risk 8: Overbuilding Before Product-Market Fit

* **Impact:** Too many features may slow launch.
* **Mitigation:** Phased roadmap, MVP scope discipline, beta feedback.

### Risk 9: Governance Workflow Too Heavy

* **Impact:** Users may avoid documentation if workflows are too strict.
* **Mitigation:** Make governance optional and configurable by space/template.

### Risk 10: AI Cost Explosion

* **Impact:** AI usage may become financially unsustainable.
* **Mitigation:** Rate limits, budgets, caching, usage analytics, model configuration.

---

# 34. Product Area: Final Open Questions

## 34.1 Product Area Overview

Open questions are decisions the product team should resolve before implementation, pricing, or enterprise sales commitments.

---

## 34.2 Epic: Product Decision Log

## Feature 34.2.1: Open Questions Register

### Use Cases

* Founder decides plan packaging.
* Product team chooses MVP scope.
* Engineering team clarifies technical tradeoffs.
* Sales team avoids promising unapproved features.

### User Stories

* As a product owner, I want open questions tracked so that decisions are not forgotten.
* As an engineer, I want product decisions documented so that implementation is aligned.
* As a sales person, I want feature availability clear so that customer commitments are accurate.

### Acceptance Criteria

* Open questions are listed.
* Each question has owner and decision deadline.
* Decisions are recorded.
* Decisions link to roadmap/features.

### Functional Requirements

Fields:

* Question.
* Category.
* Options.
* Recommended decision.
* Owner.
* Deadline.
* Decision.
* Decision date.
* Related feature.

### UX/UI Requirements

* Can start as a decision log template.
* High-impact unresolved questions should be highlighted.

### Technical Notes

* Use ADR-style decision records for major product/architecture decisions.

### Test Cases

* Open question created.
* Decision recorded.
* Related feature updated after decision.

---

## 34.3 Critical Open Questions

1. Should public page sharing be available in Community, or only Business?
2. Should AI Search be Business, Enterprise, or usage-metered add-on?
3. Should MCP be Business or Enterprise?
4. Should page-level permissions be Business or Enterprise?
5. Should guest access be Enterprise-only?
6. Should two-way repository sync be supported, or only one-way repository-to-wiki sync?
7. Should public AI Search be available in self-hosted deployments?
8. What is the billing policy for guest users?
9. Should public comments be supported, or only private public feedback?
10. Should mobile editing be supported in V1, or only reading/search/commenting?
11. Should templates have versioning?
12. Should approval workflow lock editing after submission?
13. Should AI be allowed to answer from unverified pages by default?
14. Should AI trust level be visible to all users or only admins?
15. Should air-gapped deployment be Business or Enterprise?
16. Should documentation health be Enterprise-only or available in Business with limits?
17. Should Confluence import be Business or Enterprise?
18. Should audit logs be Enterprise-only?
19. What minimum feature set is required for first paying customer?
20. What exact deployment profiles will be officially supported?

---

# 35. Final Closing Summary

This continuation completes the product documentation from **Feature 29.4.1: Role-Based Learning and Knowledge Paths** to the end.

It expands the product into final readiness areas:

* Intelligent onboarding paths.
* AI-generated learning paths.
* Certification and required reading.
* Personalized knowledge recommendations.
* Expert recommendations.
* MVP readiness checklist.
* Business readiness checklist.
* Enterprise readiness checklist.
* Launch operations and rollout.
* Customer training and enablement.
* Success metrics and KPIs.
* Risk register.
* Open questions.

The final product direction is clear:

> **ConqrAI Wiki should be built as a governed AI knowledge operating system, not just a collaborative wiki.**

That means the product must help companies:

* Create documentation.
* Organize knowledge.
* Search with AI.
* Validate with experts.
* Govern with permissions and audit logs.
* Improve documentation health.
* Onboard people faster.
* Share knowledge safely.
* Connect docs to code, projects, and workflows.
* Operate reliably in cloud, self-hosted, and air-gapped environments.

The strongest long-term differentiation is the combination of:

1. **Collaborative documentation.**
2. **Permission-aware AI Search and AI Chat.**
3. **Human-in-the-loop expert validation.**
4. **Documentation Health Center.**
5. **Enterprise governance and deployment readiness.**
6. **Knowledge onboarding and continuous improvement workflows.**

Final positioning:

> **ConqrAI Wiki is an AI-powered collaborative documentation and knowledge governance platform that helps organizations turn internal expertise, technical documentation, policies, and operational processes into trusted, searchable, verified, and continuously improved knowledge systems.**
36. Final Executive Summary
37. Final Feature Inventory
38. Final Roadmap Summary
39. Final Pricing and Packaging Recommendation
40. Final Go-To-Market Narrative
41. Final Implementation Priorities
42. Final Acceptance Gate Before Public Launch
43. Final One-Page Product Summary
44. Final Closing Statement