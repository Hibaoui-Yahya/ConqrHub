/**
 * Demo seed for the Documentation Health Center.
 *
 * Populates one workspace with two extra spaces and ~40 pages spanning every
 * health category so the dashboard renders something meaningful immediately.
 *
 * Run: pnpm run seed:doc-health
 *
 * Prerequisites:
 *   1. The stack is up (db + redis).
 *   2. A workspace already exists (create one via `/setup` or the UI).
 *   3. Migrations have been applied.
 */
import * as dotenv from 'dotenv';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { envPath, normalizePostgresUrl } from '../../common/helpers';
import type { DB } from '../types/db';

dotenv.config({ path: envPath });

const db = new Kysely<DB>({
  dialect: new PostgresJSDialect({
    postgres: postgres(normalizePostgresUrl(process.env.DATABASE_URL!)),
  }),
  plugins: [new CamelCasePlugin()],
});

const DAY_MS = 86_400_000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY_MS);

const STRONG_CONTENT =
  'This page is a substantial reference document with multiple sections covering ' +
  'background, setup, configuration, integration patterns, troubleshooting steps, ' +
  'failure modes, escalation playbooks, and links to related material. '.repeat(8);

const WEAK_CONTENT = 'Just a stub. TODO: write this up.';

type PageSpec = {
  title: string;
  ageDays: number;
  hasOwner: boolean;
  contentStrong: boolean;
  verification?: 'verified' | 'expiring' | 'expired' | null;
};

function slugId() {
  return uuidv7().replace(/-/g, '').slice(0, 12);
}

function position(index: number) {
  return `a${index.toString().padStart(4, '0')}`;
}

async function ensureSpace(args: {
  workspaceId: string;
  slug: string;
  name: string;
  isCritical: boolean;
  creatorId: string;
}): Promise<string> {
  const existing = await db
    .selectFrom('spaces')
    .select(['id'])
    .where('workspaceId', '=', args.workspaceId)
    .where('slug', '=', args.slug)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('spaces')
      .set({ isCritical: args.isCritical })
      .where('id', '=', existing.id)
      .execute();
    return existing.id;
  }

  const id = uuidv7();
  await db
    .insertInto('spaces')
    .values({
      id,
      workspaceId: args.workspaceId,
      slug: args.slug,
      name: args.name,
      defaultRole: 'member',
      visibility: 'open',
      creatorId: args.creatorId,
      isCritical: args.isCritical,
    })
    .execute();
  return id;
}

async function insertPage(args: {
  workspaceId: string;
  spaceId: string;
  creatorId: string;
  ownerId: string | null;
  spec: PageSpec;
  index: number;
}): Promise<string> {
  const id = uuidv7();
  const updatedAt = daysAgo(args.spec.ageDays);
  const text = args.spec.contentStrong ? STRONG_CONTENT : WEAK_CONTENT;

  await db
    .insertInto('pages')
    .values({
      id,
      slugId: slugId(),
      title: args.spec.title,
      position: position(args.index),
      spaceId: args.spaceId,
      workspaceId: args.workspaceId,
      creatorId: args.creatorId,
      lastUpdatedById: args.creatorId,
      ownerId: args.ownerId,
      textContent: text,
      content: sql`${JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })}::jsonb`,
      createdAt: updatedAt,
      updatedAt,
    } as any)
    .execute();

  if (args.spec.verification) {
    const verifiedAt = updatedAt;
    const expiresAt =
      args.spec.verification === 'verified'
        ? new Date(now + 60 * DAY_MS)
        : args.spec.verification === 'expiring'
          ? new Date(now + 5 * DAY_MS)
          : new Date(now - 5 * DAY_MS);

    const status =
      args.spec.verification === 'expired' ? 'verified' : args.spec.verification;

    await db
      .insertInto('pageVerifications')
      .values({
        id: uuidv7(),
        pageId: id,
        spaceId: args.spaceId,
        workspaceId: args.workspaceId,
        type: 'expiring',
        status,
        mode: 'expiring',
        periodAmount: 90,
        periodUnit: 'day',
        verifiedAt,
        verifiedById: args.creatorId,
        expiresAt,
        creatorId: args.creatorId,
      } as any)
      .execute();
  }

  return id;
}

async function main() {
  const workspace = await db
    .selectFrom('workspaces')
    .select(['id'])
    .orderBy('createdAt', 'asc')
    .limit(1)
    .executeTakeFirst();

  if (!workspace) {
    throw new Error(
      'No workspace found. Run /setup or sign up via the UI before seeding.',
    );
  }

  const owner = await db
    .selectFrom('users')
    .select(['id'])
    .where('workspaceId', '=', workspace.id)
    .where('deletedAt', 'is', null)
    .where('deactivatedAt', 'is', null)
    .orderBy('createdAt', 'asc')
    .limit(1)
    .executeTakeFirst();

  if (!owner) {
    throw new Error('No active user found in the workspace.');
  }

  console.log(`Seeding workspace ${workspace.id} as user ${owner.id}…`);

  const criticalSpaceId = await ensureSpace({
    workspaceId: workspace.id,
    slug: 'compliance',
    name: 'Compliance',
    isCritical: true,
    creatorId: owner.id,
  });

  const generalSpaceId = await ensureSpace({
    workspaceId: workspace.id,
    slug: 'engineering',
    name: 'Engineering',
    isCritical: false,
    creatorId: owner.id,
  });

  // Wipe previous seed pages so the seed is idempotent.
  await db
    .deleteFrom('pages')
    .where('workspaceId', '=', workspace.id)
    .where('title', 'like', '[seed]%')
    .execute();

  const criticalSpecs: PageSpec[] = [
    { title: 'Data retention policy', ageDays: 5, hasOwner: true, contentStrong: true, verification: 'verified' },
    { title: 'Incident response runbook', ageDays: 30, hasOwner: true, contentStrong: true, verification: 'verified' },
    { title: 'Vendor risk review', ageDays: 60, hasOwner: true, contentStrong: true, verification: 'expiring' },
    { title: 'Backup and restore procedure', ageDays: 200, hasOwner: true, contentStrong: true, verification: 'expired' },
    { title: 'Access review', ageDays: 250, hasOwner: false, contentStrong: true, verification: null },
    { title: 'PII handling guide', ageDays: 400, hasOwner: true, contentStrong: true, verification: null },
    { title: 'GDPR DPIA checklist', ageDays: 10, hasOwner: true, contentStrong: false, verification: null },
    { title: 'Encryption standards', ageDays: 15, hasOwner: true, contentStrong: true, verification: 'verified' },
    { title: 'Audit log retention', ageDays: 95, hasOwner: false, contentStrong: true, verification: null },
    { title: 'SOC 2 evidence index', ageDays: 25, hasOwner: true, contentStrong: true, verification: 'verified' },
    { title: 'Subprocessor list', ageDays: 220, hasOwner: true, contentStrong: false, verification: null },
    { title: 'Acceptable use policy', ageDays: 7, hasOwner: true, contentStrong: true, verification: 'verified' },
  ];

  const generalSpecs: PageSpec[] = [
    { title: 'Onboarding guide', ageDays: 3, hasOwner: true, contentStrong: true },
    { title: 'CI/CD overview', ageDays: 8, hasOwner: true, contentStrong: true },
    { title: 'Local dev setup', ageDays: 12, hasOwner: true, contentStrong: true },
    { title: 'Coding standards', ageDays: 45, hasOwner: true, contentStrong: true },
    { title: 'Code review checklist', ageDays: 60, hasOwner: false, contentStrong: true },
    { title: 'Release process', ageDays: 100, hasOwner: true, contentStrong: true },
    { title: 'Old API quirks', ageDays: 280, hasOwner: false, contentStrong: false },
    { title: 'Feature flag conventions', ageDays: 200, hasOwner: true, contentStrong: true },
    { title: 'Migration playbook', ageDays: 14, hasOwner: true, contentStrong: true },
    { title: 'Observability primer', ageDays: 21, hasOwner: true, contentStrong: true },
    { title: 'On-call rota', ageDays: 5, hasOwner: false, contentStrong: false },
    { title: 'Service catalog', ageDays: 90, hasOwner: true, contentStrong: true },
    { title: 'Decommission notes', ageDays: 500, hasOwner: false, contentStrong: false },
    { title: 'Build cache tips', ageDays: 35, hasOwner: true, contentStrong: false },
  ];

  let index = 0;
  for (const spec of criticalSpecs) {
    await insertPage({
      workspaceId: workspace.id,
      spaceId: criticalSpaceId,
      creatorId: owner.id,
      ownerId: spec.hasOwner ? owner.id : null,
      spec: { ...spec, title: `[seed] ${spec.title}` } as any,
      index: index++,
    });
  }
  for (const spec of generalSpecs) {
    await insertPage({
      workspaceId: workspace.id,
      spaceId: generalSpaceId,
      creatorId: owner.id,
      ownerId: spec.hasOwner ? owner.id : null,
      spec: { ...spec, title: `[seed] ${spec.title}` } as any,
      index: index++,
    });
  }

  console.log(
    `Seeded ${criticalSpecs.length} pages in '${'compliance'}' (critical) and ${generalSpecs.length} pages in '${'engineering'}'.`,
  );

  await seedChatGaps({
    workspaceId: workspace.id,
    creatorId: owner.id,
  });

  console.log('Done. Visit /settings/health as a workspace admin.');

  await db.destroy();
}

const RECURRING_QUESTIONS: Array<{
  question: string;
  occurrences: number;
  spreadDays: number;
}> = [
  { question: 'How do I reset my MFA?', occurrences: 6, spreadDays: 14 },
  { question: 'Where is the on-call rotation calendar?', occurrences: 4, spreadDays: 10 },
  { question: 'What is the data retention policy?', occurrences: 3, spreadDays: 21 },
  { question: 'Who owns the billing-events service?', occurrences: 3, spreadDays: 7 },
];

const ONE_OFF_QUESTIONS = [
  'Can I install Docker on Windows ARM?',
  'Is there a quarterly OKR template?',
  'What time does the standup start?',
];

async function seedChatGaps(args: {
  workspaceId: string;
  creatorId: string;
}): Promise<void> {
  // Wipe previous seed chats so we are idempotent.
  const existingChats = await db
    .selectFrom('aiChats')
    .select('id')
    .where('workspaceId', '=', args.workspaceId)
    .where('title', 'like', '[seed]%')
    .execute();
  if (existingChats.length > 0) {
    const ids = existingChats.map((c) => c.id);
    await db
      .deleteFrom('aiChatMessages')
      .where('chatId', 'in', ids)
      .execute();
    await db.deleteFrom('aiChats').where('id', 'in', ids).execute();
  }

  // One chat thread for the demo, all messages attributed to the same user.
  const chatId = uuidv7();
  await db
    .insertInto('aiChats')
    .values({
      id: chatId,
      workspaceId: args.workspaceId,
      creatorId: args.creatorId,
      title: '[seed] Demo questions',
    } as any)
    .execute();

  let inserted = 0;
  for (const recurring of RECURRING_QUESTIONS) {
    for (let i = 0; i < recurring.occurrences; i++) {
      const ageMs =
        (recurring.spreadDays / Math.max(1, recurring.occurrences - 1)) *
        i *
        DAY_MS;
      const askedAt = new Date(now - ageMs);
      // Vary capitalization/whitespace so the normalization actually does work.
      const variants = [
        recurring.question,
        recurring.question.toLowerCase(),
        `  ${recurring.question}  `,
        recurring.question.replace(/\s+/g, '  '),
      ];
      const content = variants[i % variants.length];
      await db
        .insertInto('aiChatMessages')
        .values({
          id: uuidv7(),
          chatId,
          workspaceId: args.workspaceId,
          userId: args.creatorId,
          role: 'user',
          content,
          createdAt: askedAt,
          updatedAt: askedAt,
        } as any)
        .execute();
      inserted += 1;
    }
  }

  for (const oneOff of ONE_OFF_QUESTIONS) {
    const askedAt = new Date(now - 3 * DAY_MS);
    await db
      .insertInto('aiChatMessages')
      .values({
        id: uuidv7(),
        chatId,
        workspaceId: args.workspaceId,
        userId: args.creatorId,
        role: 'user',
        content: oneOff,
        createdAt: askedAt,
        updatedAt: askedAt,
      } as any)
      .execute();
    inserted += 1;
  }

  console.log(
    `Seeded ${inserted} chat messages (${RECURRING_QUESTIONS.length} recurring topics + ${ONE_OFF_QUESTIONS.length} one-offs).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
