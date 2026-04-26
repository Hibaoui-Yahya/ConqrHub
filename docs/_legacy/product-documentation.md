# ConqrAI Wiki — Complete Product & Feature Documentation

## 1. Product Definition

**ConqrAI Wiki** is an enterprise collaborative wiki and documentation platform designed to help organizations centralize, govern, improve, and operationalize company knowledge.

It combines a modern real-time wiki, structured technical documentation, AI-powered knowledge discovery, permission-aware collaboration, compliance workflows, and human-in-the-loop validation. The goal is not only to store pages, but to transform company knowledge into a living operational intelligence system.

ConqrAI Wiki can be positioned as a hybrid between:

* Confluence for structured company documentation
* Notion for flexible collaborative writing
* GitBook for product and technical documentation
* Guru for verified knowledge management
* Glean-style AI search for enterprise knowledge discovery
* Internal AI assistant for documentation creation and maintenance

## 2. Target Users

### 2.1 Company Employees

Employees use the platform to find procedures, policies, onboarding materials, technical guides, project documentation, and operational knowledge.

Main needs:

* Quickly find trusted information
* Ask questions in natural language
* Understand internal processes
* Collaborate on team documentation
* Comment, ask for clarification, and receive updates

### 2.2 Knowledge Managers

Knowledge managers own documentation quality and governance.

Main needs:

* Detect outdated documentation
* Assign owners and reviewers
* Standardize documentation templates
* Monitor documentation health
* Ensure critical pages are verified

### 2.3 Technical Teams

Engineering, data, AI, product, and DevOps teams use the platform for product documentation, architecture, APIs, databases, runbooks, deployment guides, and incident knowledge.

Main needs:

* Rich technical editor
* Code blocks and diagrams
* API documentation blocks
* Architecture diagrams
* GitHub/GitLab/Bitbucket integration
* Version history and restore
* Review and approval workflow

### 2.4 Admins and IT/Security Teams

Admins manage users, security, permissions, compliance, SSO, audit logs, and workspace configuration.

Main needs:

* SSO and MFA
* SCIM provisioning
* Audit logs
* API keys
* Retention policies
* Access control
* Public sharing controls
* Air-gapped and self-hosted deployments

### 2.5 External Clients and Partners

External users can access selected spaces or public documentation.

Main needs:

* Read selected pages
* Access client-specific documentation
* Comment where allowed
* Use public documentation portals
* Search published knowledge

## 3. Product Architecture Overview

ConqrAI Wiki is built as a monorepo with pnpm workspaces and Nx orchestration.

### 3.1 Monorepo Structure

* `apps/client`: React 18 SPA using Vite, Mantine UI, React Router, Jotai, and TanStack Query
* `apps/server`: NestJS backend using Fastify, PostgreSQL, Kysely, Redis, BullMQ, Passport, CASL, and integrations
* `packages/editor-ext`: Shared Tiptap editor extensions
* `packages/ee`: Enterprise features loaded dynamically at runtime

### 3.2 Backend Domains

Recommended backend modules:

* Auth
* Users
* Workspace
* Spaces
* Pages
* Comments
* Groups
* Permissions
* Search
* Sharing
* Templates
* Import
* Export
* Notifications
* Audit
* AI
* AI Chat
* MCP
* API Keys
* Billing
* License
* Verification
* Retention
* Analytics
* Integrations
* SCIM

### 3.3 Frontend Domains

Recommended frontend feature modules:

* Pages
* Spaces
* Editor
* Comments
* Search
* AI Assistant
* AI Chat
* Templates
* Settings
* Security
* Billing
* License
* Audit Logs
* Import/Export
* Notifications
* Analytics
* Verification
* Public Sharing
* User Management

### 3.4 Real-Time Architecture

ConqrAI Wiki uses:

* Hocuspocus server for Yjs CRDT document collaboration
* WebSocket endpoint at `/collab`
* Socket.io for presence, notifications, and general real-time events
* Redis for queues and event coordination
* PostgreSQL for persistent data

## 4. Core Workspace Features

## 4.1 Workspace Management

A workspace represents one company, organization, or tenant.

### Functionality

* Create workspace
* Configure workspace name, logo, domain, and default settings
* Manage members
* Manage groups
* Manage spaces
* Configure billing/license
* Configure security settings
* Configure AI features
* Configure sharing policies
* Configure audit and retention policies

### Suggested Sub-Features

#### Workspace Profile

Fields:

* Workspace name
* Workspace URL/domain
* Logo
* Brand color
* Default language
* Timezone
* Workspace description

#### Workspace Settings

Settings categories:

* General
* Members
* Groups
* Spaces
* Security & SSO
* Public Sharing
* AI Settings
* Templates
* API Management
* Audit Logs
* Billing or License
* Data Retention
* Import/Export

#### Workspace Health

A workspace-level dashboard should show:

* Total pages
* Total spaces
* Total users
* Active users
* Outdated pages
* Unverified pages
* Failed searches
* Pages without owners
* AI usage
* Storage usage
* Public links
* Security warnings

## 4.2 Spaces

Spaces organize knowledge by function, department, project, team, or client.

Examples:

* Engineering
* Product
* HR
* Sales
* Customer Support
* Security
* Operations
* Legal
* Client Projects
* Technical Documentation
* Product Documentation
* Internal Policies

### Functionality

* Create space
* Edit space name, slug, icon, and description
* Archive space
* Delete space
* Manage space members
* Manage space groups
* Configure space permissions
* Configure space sharing
* Configure space templates
* Export space
* Import into space
* View space analytics

### Space Types

#### Public Internal Space

Visible to all workspace members.

Use cases:

* Company handbook
* General policies
* Internal announcements

#### Private Space

Visible only to selected users or groups.

Use cases:

* Leadership documentation
* HR confidential processes
* Client-specific projects

#### Restricted Space

Visible to selected members, but with granular page-level controls.

Use cases:

* Security documentation
* Product roadmap
* Financial operations

#### Public Documentation Space

Can be shared externally through public links or a documentation portal.

Use cases:

* Product docs
* API docs
* Help center
* Client onboarding docs

## 4.3 Pages

Pages are the primary knowledge objects.

### Core Page Functionality

* Create page
* Edit page
* Autosave page
* Publish page
* Draft page
* Rename page
* Add icon
* Add cover image
* Move page
* Copy page
* Duplicate page
* Delete page
* Restore page
* Permanently delete page
* Export page
* Share page
* Comment on page
* View page history
* Restore previous version
* Assign page owner
* Verify page
* Mark page obsolete

### Page Metadata

Each page should support:

* Title
* Slug
* Space
* Parent page
* Creator
* Last editor
* Owner
* Tags
* Status
* Verification status
* Last updated date
* Created date
* Last viewed date
* Access rules
* Public share status
* AI indexing status

### Page Statuses

Recommended statuses:

* Draft
* Published
* In review
* Approved
* Verified
* Expiring
* Expired
* Obsolete
* Archived
* Deleted

### Page Tree

The page tree should support:

* Nested hierarchy
* Drag-and-drop ordering
* Collapse/expand nodes
* Move page across spaces
* Copy page across spaces
* Display private/restricted indicators
* Display verified/outdated indicators
* Display unread updates
* Show recently edited pages
* Show favorites

## 5. Editor Features

## 5.1 Rich Text Editor

The editor is the heart of the wiki.

### Basic Blocks

* Paragraph
* Heading 1, 2, 3, 4
* Bullet list
* Numbered list
* Checklist
* Quote
* Divider
* Link
* Image
* Video
* File attachment
* Table
* Code block
* Inline code

### Advanced Blocks

* Callout block
* Info block
* Warning block
* Error block
* Success block
* Toggle/accordion
* Tabs
* Columns
* Table of contents
* Button/link card
* Embed block
* Mermaid diagram
* Draw.io diagram
* Excalidraw diagram
* Math block
* API endpoint block
* Database schema block
* Architecture decision record block
* Runbook step block
* Process step block

### Editing UX

* Slash command menu
* Bubble formatting toolbar
* Drag handle for blocks
* Block duplication
* Block deletion
* Block movement
* Keyboard shortcuts
* Markdown shortcuts
* Paste from Markdown
* Paste from HTML
* Paste from Word/Google Docs
* Smart paste cleanup
* Autosave indicator
* Collaboration cursors

## 5.2 Technical Documentation Blocks

### API Endpoint Block

Used to document REST, GraphQL, or internal service endpoints.

Fields:

* Method
* Path
* Description
* Authentication
* Headers
* Query parameters
* Path parameters
* Request body
* Response body
* Error responses
* cURL example
* JavaScript example
* Python example

### Database Table Block

Used to document schemas.

Fields:

* Table name
* Description
* Columns
* Data types
* Nullable fields
* Primary key
* Foreign keys
* Indexes
* Constraints
* Example query

### Architecture Block

Used to describe systems.

Fields:

* System overview
* Components
* Data flow
* Dependencies
* Failure modes
* Security considerations
* Deployment notes
* Related diagrams

### Runbook Block

Used for operational procedures.

Fields:

* Objective
* Preconditions
* Steps
* Expected result
* Rollback plan
* Owner
* Escalation contact
* Related incidents

### ADR Block

Architecture Decision Record fields:

* Context
* Decision
* Alternatives considered
* Consequences
* Owner
* Date
* Status

## 6. Collaboration Features

## 6.1 Real-Time Collaboration

Multiple users can edit the same page simultaneously.

### Functionality

* Live collaborative editing
* User cursors
* User avatars
* Presence indicators
* Conflict-free updates
* Offline recovery
* Autosave
* Connection status
* Reconnect handling

### Innovation Additions

#### Collaboration Timeline

Shows who edited what and when, grouped by session.

#### Focus Mode

Allows one user to write without distractions while others can still comment.

#### Edit Lock for Critical Pages

For verified or regulated content, admins may require checkout/check-in editing.

## 6.2 Comments

### Core Comments

* Inline comments
* Page-level comments
* Comment replies
* Mentions
* Resolve comments
* Reopen comments
* Delete comments
* Edit comments
* Comment notifications

### Advanced Comments

* Assign comment to user
* Add due date
* Add priority
* Filter unresolved comments
* Sort by newest/oldest/priority
* Show comment history
* Convert comment into task
* Link comment to Jira/Linear issue

### Viewer Comments

Admins can allow read-only viewers to comment without editing the page.

Use cases:

* Review by non-editors
* External client feedback
* Policy feedback

## 6.3 Notifications

### Notification Channels

* In-app notifications
* Email notifications
* Slack notifications
* Microsoft Teams notifications
* Webhook notifications

### Notification Events

* User mentioned
* Comment replied
* Comment resolved
* Page assigned for review
* Review approved
* Review rejected
* Verification expiring
* Page expired
* Page updated
* Public share created
* Permission changed
* Import completed
* Export completed
* AI detected a knowledge gap

## 7. Search Features

## 7.1 Full-Text Search

Search across workspace knowledge.

### Functionality

* Search page titles
* Search page content
* Search comments
* Search attachments
* Search templates
* Search users
* Search groups
* Search spaces
* Highlight matching text
* Permission-aware filtering
* Search suggestions

### Filters

* Space
* Author
* Owner
* Tag
* Date created
* Date updated
* Verification status
* Page status
* Attachment type
* Has comments
* Has unresolved comments

## 7.2 Typesense Search Driver

Advanced search driver for faster and richer search.

### Functionality

* Typo tolerance
* Fast indexing
* Faceted search
* Ranking controls
* Better suggestions
* Relevance tuning
* Attachment content search

## 7.3 Attachment Indexing

Indexes content from uploaded files.

Supported file types:

* PDF
* DOCX
* Markdown
* HTML
* TXT
* CSV
* XLSX, optional future support
* PPTX, optional future support

### Functionality

* Extract text from attachments
* Index attachment content
* Show attachment result snippets
* Link search result to parent page
* Respect page permissions

## 7.4 AI Search / AI Answers

AI Search allows users to ask natural-language questions and receive answers grounded in workspace content.

### Functionality

* Ask questions in natural language
* Generate answer from internal pages
* Cite source pages
* Cite source excerpts
* Show confidence score
* Show related pages
* Ask follow-up questions
* Permission-aware retrieval
* Prevent answers from inaccessible pages

### Example

Question:

> How do we deploy the production backend?

Answer:

> The production backend deployment process requires code review, staging validation, migration check, approval from DevOps, and release monitoring.

Sources:

* Engineering / Production Deployment
* DevOps / Migration Checklist
* Security / Release Approval Policy

### Innovation Additions

#### Answer Trust Level

AI answers should show:

* High trust: based on verified and recent pages
* Medium trust: based on normal pages
* Low trust: based on outdated or unverified pages

#### Missing Source Warning

If the AI cannot find strong documentation, it should say:

> I could not find a verified source for this answer. You may need to create or update documentation.

## 8. AI Features

## 8.1 AI Assistant in Editor

The AI Assistant helps users write and improve content.

### Actions

* Improve writing
* Fix spelling and grammar
* Make shorter
* Make longer
* Simplify
* Change tone
* Summarize
* Explain
* Continue writing
* Translate
* Generate title
* Generate introduction
* Generate conclusion
* Convert notes into structured documentation
* Convert meeting notes into decisions
* Convert rough ideas into SOP
* Generate FAQ
* Generate checklist

### Context Awareness

The assistant should use:

* Selected text
* Current page title
* Current page content
* Space context
* Related pages
* Company glossary
* User role and intent

## 8.2 AI Chat

AI Chat is a workspace assistant for interacting with knowledge.

### Functionality

* Multi-turn conversations
* Ask about workspace content
* Mention pages with `@page`
* Upload files
* Search pages
* Read page content
* Create new pages
* Update pages
* List spaces
* List pages
* Summarize spaces
* Summarize projects
* Generate reports
* Search attachments
* Create comments

### Suggested Modes

#### Page Mode

Chat about the current page.

#### Space Mode

Chat about a full space.

#### Workspace Mode

Chat across all accessible workspace content.

#### Creation Mode

Generate new documentation.

#### Admin Mode

Analyze documentation quality and workspace health.

## 8.3 AI Documentation Generator

Generates complete documentation from a short brief.

### Input

* Product name
* Product description
* Target users
* Main features
* Technical stack
* Deployment type
* Integrations
* Security needs

### Output

* Product overview
* User guide
* Admin guide
* Technical architecture
* API documentation
* Database documentation
* Deployment guide
* Security guide
* FAQ
* Release notes

## 8.4 AI Knowledge Gap Detection

AI scans workspace content and identifies missing or weak documentation.

### Detects

* Missing pages
* Outdated pages
* Duplicated pages
* Contradictory pages
* Pages without owners
* Pages without verification
* Frequently searched topics with no results
* Pages with many unresolved comments
* Critical processes without runbooks

### Output

* Knowledge gap list
* Suggested page titles
* Suggested owners
* Suggested priority
* Suggested template
* Suggested content outline

## 8.5 Human-in-the-Loop Expert Insights

Experts can improve AI answers and documentation.

### Functionality

* Add expert insight below AI answers
* Add correction
* Add warning
* Add operational note
* Add best practice
* Add workaround
* Add example
* Attach files, images, audio, or video
* Mark insight as verified
* Vote insight as helpful

### Expert Insight Metadata

* Expert name
* Role
* Department
* Date
* Confidence level
* Related page
* Related source
* Verification status

### Why It Matters

This makes ConqrAI Wiki different from normal AI search. The system improves over time using human expertise, not just embeddings and LLM output.

## 8.6 AI Governance

AI features require governance.

### Functionality

* Enable/disable AI per workspace
* Enable/disable AI per space
* Choose AI provider
* Configure model
* Configure embedding model
* Configure data retention for AI chats
* Disable external AI providers for sensitive spaces
* Show AI usage logs
* Show token cost
* Show AI answer feedback
* Prevent AI from answering from unverified pages, optional

## 9. Permissions and Access Control

## 9.1 Workspace Roles

Recommended roles:

* Owner
* Admin
* Knowledge Manager
* Space Admin
* Editor
* Commenter
* Viewer
* Guest
* External Client

### Owner

Full control over workspace, billing/license, security, audit logs, and deletion.

### Admin

Manages users, groups, spaces, settings, and security.

### Knowledge Manager

Manages documentation quality, templates, verification, and knowledge health.

### Space Admin

Manages one or more spaces.

### Editor

Creates and edits pages.

### Commenter

Can read and comment but cannot edit.

### Viewer

Can only read.

### Guest / External Client

Limited access to selected spaces or pages.

## 9.2 Space-Level Permissions

For each space:

* View
* Edit
* Comment
* Manage pages
* Manage members
* Manage settings
* Export
* Share publicly
* Create templates

## 9.3 Page-Level Permissions

Granular permissions for individual pages.

### Functionality

* Restrict page
* Unrestrict page
* Add user permission
* Add group permission
* Set role: reader/writer
* Inherit restrictions from parent page
* Break inheritance
* Show access explanation

### Use Cases

* Confidential HR page inside HR space
* Private roadmap inside Product space
* Client-specific page inside shared project space
* Security incident page restricted to security team

## 9.4 Groups

Groups simplify permission management.

### Functionality

* Create group
* Rename group
* Delete group
* Add members
* Remove members
* Assign group to spaces
* Assign group to pages
* Sync groups from SSO/SCIM

Examples:

* Engineering
* Product
* HR
* Leadership
* DevOps
* Security
* Customer Success

## 10. Public Sharing and External Documentation

## 10.1 Public Page Sharing

Allows a page to be accessed by external users.

### Functionality

* Create public link
* Revoke public link
* Regenerate link
* Password-protect link
* Set expiration date
* Allow/disallow indexing by search engines
* Remove branding
* Track public views

## 10.2 Space-Level Public Sharing

Allows an entire space to become a public docs portal.

### Functionality

* Public documentation site
* Custom domain
* Public navigation
* Public search
* Branding customization
* SEO metadata
* Public feedback form

## 10.3 Sharing Controls

Admins can control sharing globally.

### Functionality

* Disable public sharing workspace-wide
* Disable public sharing per space
* Delete existing public links when disabled
* Restrict sharing to admins
* Restrict sharing to verified pages only
* Audit all public sharing events

## 11. Security and Authentication

## 11.1 Authentication Methods

Supported:

* Email/password
* Google OAuth
* SAML 2.0
* OIDC
* LDAP/Active Directory
* JWT cookie authentication
* API key authentication

## 11.2 SSO

Single Sign-On helps companies centralize authentication.

### Providers

* Google OAuth
* SAML 2.0
* OIDC
* LDAP/Active Directory

### Functionality

* Create SSO provider
* Update SSO provider
* Delete SSO provider
* Enable/disable SSO provider
* Allow signup
* Enforce SSO
* Map identity provider attributes
* Sync groups, advanced

## 11.3 MFA

Multi-Factor Authentication improves account security.

### Functionality

* TOTP authenticator app
* QR code setup
* Backup codes
* Disable MFA
* Regenerate backup codes
* Enforce MFA workspace-wide
* Admin reset MFA, future

## 11.4 SCIM Provisioning

Enterprise user lifecycle automation.

### Functionality

* Create users from identity provider
* Deactivate users automatically
* Sync user attributes
* Sync groups
* Map IdP groups to workspace groups
* Support Okta, Azure AD, Google Workspace, and other SCIM 2.0 providers

## 11.5 API Keys

API keys allow external systems and automation to access ConqrAI Wiki.

### Functionality

* Create API key
* Name API key
* Set expiration date
* Revoke API key
* Track last used date
* Show token once
* Workspace-level API keys
* User-level API keys
* Restrict API key creation to admins

### Uses

* MCP authentication
* External automation
* Import/export scripts
* CI/CD documentation updates
* Integration with internal systems

## 11.6 Security Controls

Security settings should include:

* Enforce SSO
* Enforce MFA
* Allowed email domains
* Disable public sharing
* Restrict API key creation
* Restrict template creation
* Restrict exports
* Restrict AI usage
* Control external embeds
* Configure session duration
* Configure retention policies

## 12. Enterprise Compliance Features

## 12.1 Audit Logs

Audit logs track critical activity.

### Events

* User login
* User logout
* User created
* User deleted
* User role changed
* Workspace updated
* Space created
* Space deleted
* Page created
* Page updated
* Page deleted
* Page restored
* Page moved
* Comment created
* Comment resolved
* Permission changed
* Public share created
* Public share deleted
* API key created
* API key revoked
* SSO provider changed
* MFA enabled/disabled
* Page verified
* Page approval rejected
* Import/export events
* AI answer generated
* AI tool used

### Filters

* Event type
* Actor
* Date range
* Space
* Resource type
* Resource ID

## 12.2 Retention Controls

Retention settings define automatic deletion or preservation rules.

### Functionality

* Trash retention
* Audit log retention
* AI chat retention
* Attachment retention
* Export retention
* Legal hold, future

## 12.3 Page Verification and Review Workflow

Critical pages should not remain unofficial or outdated.

### Verification Modes

#### Expiring Verification

A page is verified for a period and later requires review again.

Use cases:

* Security policies
* HR policies
* Deployment runbooks
* Compliance procedures

#### QMS Approval

Formal approval workflow.

Flow:

1. Author submits page for approval
2. Verifier reviews page
3. Verifier approves or rejects
4. Rejection requires a reason
5. Approved page becomes verified
6. Page can later expire or become obsolete

### Statuses

* Draft
* In approval
* Approved
* Rejected
* Verified
* Expiring
* Expired
* Obsolete

### Notifications

* Approval requested
* Page approved
* Page rejected
* Verification expiring
* Verification expired

## 13. Import and Export

## 13.1 Import Features

Supported imports:

* Markdown
* HTML
* Notion ZIP
* Confluence ZIP
* DOCX
* PDF attachment indexing
* GitHub docs, future
* Google Docs, future
* SharePoint, future

### Import Functionality

* Import single file
* Import ZIP
* Preserve page hierarchy
* Preserve attachments
* Preserve links
* Preserve headings
* Preserve tables
* Show import progress
* Show import errors
* Rollback import
* Detect duplicate pages
* Map authors, advanced

## 13.2 Export Features

Supported exports:

* Markdown
* HTML
* PDF
* DOCX, future
* Full space ZIP
* Full workspace export

### Export Functionality

* Export current page
* Export page with children
* Export whole space
* Include attachments
* Rewrite internal links
* Respect permissions
* Generate export job
* Notify when export is ready

## 14. Templates

Templates standardize documentation quality.

## 14.1 Template Types

Recommended templates:

* Product Requirements Document
* Technical Specification
* Architecture Decision Record
* API Documentation
* Database Schema Documentation
* Standard Operating Procedure
* Incident Report
* Postmortem
* Meeting Notes
* Onboarding Guide
* Client Project Brief
* Security Policy
* HR Policy
* Release Notes
* QA Test Plan
* Deployment Guide
* Runbook
* Troubleshooting Guide
* Integration Guide
* User Manual
* Admin Manual

## 14.2 Template Functionality

* Create template
* Edit template
* Delete template
* Use template to create page
* Preview template
* Space-level template
* Workspace-level template
* Search templates
* Categorize templates
* Restrict who can create templates
* AI-generate template

## 15. Diagrams and Visual Documentation

The platform should support diagrams directly inside documentation.

### Supported Diagrams

* Mermaid
* Draw.io
* Excalidraw
* Flowcharts
* Sequence diagrams
* Architecture diagrams
* ERD diagrams
* Mind maps
* Process maps

### Functionality

* Insert diagram
* Edit diagram
* Preview diagram
* Export diagram
* Version diagram with page history
* AI-generate diagram from text, future

## 16. Version History

Version history is critical for trust and recovery.

### Functionality

* Save page revisions
* View revision list
* Compare revisions
* Restore revision
* See who changed what
* Show diff between versions
* Restore deleted pages
* Version diagrams and attachments, advanced

## 17. Admin Dashboard and Analytics

## 17.1 Admin Dashboard

Metrics:

* Total users
* Active users
* Total pages
* Total spaces
* Total comments
* Total attachments
* Storage usage
* AI usage
* Search usage
* Public links
* Security warnings
* Pending reviews
* Expired pages

## 17.2 Page Analytics

For each page:

* Views
* Unique viewers
* Read time
* Last viewed
* Last edited
* Top referrers
* Search queries leading to page
* Comment count
* Unresolved comments
* AI citations count

## 17.3 Space Analytics

For each space:

* Total pages
* Active contributors
* Outdated pages
* Verified pages
* Top viewed pages
* Top edited pages
* Failed searches
* Knowledge gaps

## 17.4 AI Analytics

Track:

* AI questions asked
* AI answers generated
* AI failed answers
* AI answer feedback
* Sources used
* Model used
* Token usage
* Cost estimate
* Most asked topics
* Most cited pages

## 18. Documentation Health Center

This should become a major ConqrAI innovation.

## 18.1 Documentation Health Score

A score from 0 to 100 based on:

* Freshness
* Completeness
* Ownership
* Verification
* Search success
* Broken links
* Duplicate content
* Unresolved comments
* AI confidence

## 18.2 Health Categories

* Healthy pages
* Outdated pages
* Missing owners
* Missing reviewers
* Duplicate pages
* Broken links
* Weak documentation
* Unanswered questions
* Failed searches
* Unverified critical pages

## 18.3 Recommended Actions

The system should suggest:

* Create missing page
* Update outdated page
* Assign owner
* Assign reviewer
* Merge duplicates
* Archive obsolete page
* Add sources
* Improve page title
* Add template structure

## 19. Integrations

## 19.1 Productivity Integrations

* Slack
* Microsoft Teams
* Google Drive
* SharePoint
* Notion
* Confluence
* Jira
* Linear
* Asana
* Trello

## 19.2 Developer Integrations

* GitHub
* GitLab
* Bitbucket
* Sentry
* Datadog
* PostHog
* OpenAPI
* CI/CD pipelines

## 19.3 Automation Integrations

* Webhooks
* Zapier
* Make
* n8n
* Custom API
* MCP

## 20. MCP Support

Model Context Protocol allows external AI tools to connect to ConqrAI Wiki.

### Functionality

* Expose MCP endpoint
* Authenticate with API key
* Search pages
* Read pages
* Create pages
* Update pages
* List spaces
* List comments
* Search attachments
* Use ConqrAI Wiki as an external AI knowledge source

### Use Cases

* Claude Desktop reads company docs
* Internal AI agents create/update docs
* Developer agents generate technical documentation
* Customer support agents retrieve verified answers

## 21. Deployment and Infrastructure

## 21.1 Self-Hosted Deployment

Supported for all tiers.

### Requirements

* Node.js
* pnpm
* PostgreSQL
* Redis
* Docker/Docker Compose

### Optional Services

* Typesense for advanced search
* Gotenberg for PDF export
* S3-compatible storage
* SMTP/Postmark for emails

## 21.2 Air-Gapped Deployment

Business/Enterprise feature for secure environments.

### Functionality

* Works without internet access
* Local storage
* Local AI provider, optional
* Local email relay, optional
* Offline license validation, if needed
* No external telemetry

## 21.3 Cloud Deployment

Cloud mode can include:

* Managed hosting
* Stripe billing
* Plan-based feature access
* Automatic upgrades
* Managed backups
* Managed email
* Managed AI provider

## 22. Billing, License, and Plans

## 22.1 Community Plan

Best for individuals, small teams, and open-source usage.

Features:

* Pages
* Rich editor
* Realtime collaboration
* Spaces
* Groups
* Page history and restore
* Comments
* Diagrams
* Basic search
* Markdown/HTML import
* Markdown/HTML export
* Self-hosting
* Community support

## 22.2 Business Plan

Best for teams needing advanced documentation, security, and productivity features.

Features:

* Everything in Community
* SSO SAML/OIDC/LDAP
* MFA
* API keys
* Page-level permissions
* Templates
* Public sharing
* Disable public sharing
* Remove branding in public pages
* Version history
* Comment resolution
* PDF export
* DOCX import
* Notion import
* Confluence import
* Typesense search
* Attachment indexing
* MCP support
* AI Search
* AI Assistant
* Air-gapped deployment
* Email support

## 22.3 Enterprise Plan

Best for large organizations with governance, compliance, and scale requirements.

Features:

* Everything in Business
* SCIM provisioning
* Audit logs
* Full security controls
* Retention controls
* Page verification and review workflow
* Advanced AI governance
* Documentation health center
* Knowledge gap detection
* Priority support
* Custom contracts
* Custom deployment support

## 23. Settings Sidebar Structure

Recommended settings structure:

### Account

* Profile
* Preferences
* Security
* API Keys
* Notifications

### Workspace

* General
* Members
* Groups
* Spaces
* Templates
* Public Sharing
* Security & SSO
* AI Settings
* API Management
* Audit Logs
* Verified Pages
* Analytics
* Billing

### System

* License & Edition
* Storage
* Email
* Search
* Import/Export
* Background Jobs
* System Health

## 24. Innovation Roadmap

## 24.1 Short-Term Innovations

* AI Search with source citations
* AI Assistant in editor
* AI Chat with page mentions
* Page verification workflow
* Documentation templates
* Attachment search
* Audit logs
* Admin dashboard

## 24.2 Mid-Term Innovations

* Documentation Health Center
* Knowledge gap detection
* Human expert insights
* AI-generated documentation spaces
* Search analytics
* Broken link detection
* Duplicate content detection
* AI usage governance

## 24.3 Long-Term Innovations

* Company Brain Graph
* AI agents that maintain documentation
* Auto-generate docs from code repositories
* Smart onboarding paths
* Role-based AI assistants
* Compliance automation
* Client-facing AI knowledge portals
* Multi-workspace knowledge federation

## 25. Product Differentiation

ConqrAI Wiki should not be positioned as only another wiki. Its differentiation should be:

1. **AI-powered knowledge discovery**: users ask questions and receive cited answers.
2. **Human-in-the-loop validation**: experts can correct and improve AI output.
3. **Documentation governance**: verification, review, retention, and audit logs.
4. **Documentation health intelligence**: the system detects outdated, missing, duplicated, and weak knowledge.
5. **Technical documentation depth**: API, database, architecture, runbook, and incident documentation blocks.
6. **Enterprise readiness**: SSO, MFA, SCIM, audit logs, air-gapped deployment, permissions, and compliance workflows.

## 26. Final Product Description

ConqrAI Wiki is an AI-powered collaborative documentation and knowledge governance platform for modern organizations. It helps teams create, organize, search, verify, and continuously improve company knowledge. Unlike traditional wikis that only store documents, ConqrAI Wiki combines real-time collaboration, enterprise permissions, AI search with citations, AI-assisted writing, human expert validation, page verification workflows, audit logs, and documentation health analytics to make knowledge reliable, discoverable, and operationally useful.

Its mission is to become the trusted company brain: a place where people, processes, data, and AI work together to preserve expertise, accelerate onboarding, reduce repeated questions, and improve decision-making across the organization.
