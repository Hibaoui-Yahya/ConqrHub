# Settings Sidebar Reference

The complete tree of the Settings sidebar, with the feature flag and minimum role required for each item.

```
Account
├── Profile                          —              all users
├── Preferences                      —              all users
├── Security                         —              all users (password, sessions)
├── 2FA / MFA                        Feature.MFA    all users
├── API Keys                         Feature.API_KEYS  all users (own keys)
└── Notifications                    —              all users

Workspace
├── General                          —              admin
├── Members                          —              admin
├── Groups                           —              admin
├── Spaces                           —              admin
├── Templates                        Feature.TEMPLATES  admin
├── Public Sharing                   —              admin
├── Disable Public Sharing           Feature.SHARING_CONTROLS  admin
├── Security & SSO                   Feature.SECURITY_SETTINGS  admin
│   ├── SSO providers                Feature.SSO_GOOGLE / Feature.SSO_CUSTOM
│   ├── Enforce SSO                  Feature.SECURITY_SETTINGS
│   ├── Enforce MFA                  Feature.MFA + Feature.SECURITY_SETTINGS
│   ├── Allowed email domains        Feature.SECURITY_SETTINGS
│   ├── Session duration             Feature.SECURITY_SETTINGS
│   ├── Restrict template creation   Feature.TEMPLATES + Feature.SECURITY_SETTINGS
│   ├── Restrict exports             Feature.SECURITY_SETTINGS
│   ├── Trash retention              Feature.RETENTION
│   └── Audit-log retention          Feature.AUDIT_LOGS
├── AI Settings                      Feature.AI         admin
│   ├── Generative AI (Ask AI)       workspace.settings.ai.generative
│   ├── AI Search                    workspace.settings.ai.search
│   ├── AI Chat                      workspace.settings.ai.chat
│   ├── MCP                          Feature.MCP + workspace.settings.ai.mcp
│   ├── Provider                     —
│   └── Models                       —
├── Verified Pages                   Feature.PAGE_VERIFICATION   admin (or knowledge mgr)
├── API Management                   Feature.API_KEYS  admin
├── Audit Log                        Feature.AUDIT_LOGS  owner (self-hosted only)
├── Analytics                        —              admin
└── Billing                          (cloud only)   admin

System
├── License & Edition                (self-hosted)  admin
├── Storage                          —              admin
├── Email                            —              admin
├── Search                           —              admin
├── Import / Export                  —              admin
├── Background Jobs                  —              admin
└── System Health                    —              admin
```

## Notes on visibility

- A locked item (the workspace doesn't have its feature) renders in the sidebar with a lock icon and links to a "feature locked" card. See [`../architecture/feature-gating.md`](../architecture/feature-gating.md) for the lock-state UI semantics.
- "Audit Log" is **owner-only and self-hosted-only** — not even Admins on cloud see it through this UI. (Cloud audit log can be exposed differently if needed — currently it's gated by self-hosted detection in addition to ownership.)
- "Billing" appears on cloud workspaces. "License & Edition" appears on self-hosted workspaces. They are mutually exclusive.

## Source of truth

The actual sidebar configuration lives in the client (`apps/client/src/features/workspace/` and `apps/client/src/features/user/`). Each item is a route-conditional render based on `useHasFeature` and the user's roles. This page mirrors that configuration; if the two diverge, the code wins.
