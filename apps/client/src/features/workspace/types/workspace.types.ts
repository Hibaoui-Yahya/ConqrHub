import { IAuthProvider } from "@/ee/security/types/security.types.ts";

export interface IWorkspace {
  id: string;
  name: string;
  description: string;
  logo: string;
  hostname: string;
  defaultSpaceId: string;
  customDomain: string;
  enableInvite: boolean;
  settings: IWorkspaceSettings;
  status: string;
  enforceSso: boolean;
  stripeCustomerId: string;
  billingEmail: string;
  trialEndAt: Date;
  createdAt: Date;
  updatedAt: Date;
  emailDomains: string[];
  memberCount?: number;
  plan?: string;
  enforceMfa?: boolean;
  aiSearch?: boolean;
  generativeAi?: boolean;
  disablePublicSharing?: boolean;
  mcpEnabled?: boolean;
  trashRetentionDays?: number;
  restrictApiToAdmins?: boolean;
  allowMemberTemplates?: boolean;
  aiStt?: boolean;
  defaultLocale?: string; // used for update
  defaultTimezone?: string; // used for update
  mailFromName?: string; // used for update
  meetSettings?: IWorkspaceMeetSettings; // used for update
}

export interface IWorkspaceSettings {
  ai?: IWorkspaceAiSettings;
  sharing?: IWorkspaceSharingSettings;
  api?: IWorkspaceApiSettings;
  templates?: IWorkspaceTemplateSettings;
  general?: IWorkspaceGeneralSettings;
  meet?: IWorkspaceMeetSettings;
}

/** Paramètres › Entreprise › Général — defaults for every member. */
export interface IWorkspaceGeneralSettings {
  defaultLocale?: string | null;
  defaultTimezone?: string | null;
  mailFromName?: string | null;
}

/** Paramètres › Applications › ConqrMeet — company-wide recording rules. */
export interface IWorkspaceMeetSettings {
  consentRequired?: boolean;
  audioRetentionDays?: number | null;
  defaultLanguage?: string | null;
  publishSpaceId?: string | null;
  autoPublish?: boolean;
}

export interface IWorkspaceApiSettings {
  restrictToAdmins?: boolean;
}

export interface IWorkspaceAiSettings {
  search?: boolean;
  generative?: boolean;
  mcp?: boolean;
  chat?: boolean;
  stt?: boolean;
}

export interface IWorkspaceSharingSettings {
  disabled?: boolean;
}

export interface IWorkspaceTemplateSettings {
  allowMemberTemplates?: boolean;
}

export interface ICreateInvite {
  role: string;
  emails: string[];
  groupIds: string[];
}

export interface IInvitation {
  id: string;
  role: string;
  email: string;
  workspaceId: string;
  invitedById: string;
  createdAt: Date;
  /** The link stops working at this date; resending or copying it renews it. */
  expiresAt?: Date | string | null;
  /** Set on the public invitation lookup. */
  expired?: boolean;
  enforceSso: boolean;
}

export interface IInvitationLink {
  inviteLink: string;
}

export interface IAcceptInvite {
  invitationId: string;
  name: string;
  password: string;
  token: string;
}

export interface IPublicWorkspace {
  id: string;
  name: string;
  logo: string;
  hostname: string;
  enforceSso: boolean;
  authProviders: IAuthProvider[];
}
