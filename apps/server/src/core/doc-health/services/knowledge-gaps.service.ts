import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

export const GAPS_DEFAULT_DAYS = 30;
export const GAPS_MAX_DAYS = 365;
export const GAPS_DEFAULT_MIN_OCCURRENCES = 2;
export const GAPS_DEFAULT_LIMIT = 25;
export const GAPS_MAX_LIMIT = 100;
export const GAPS_MIN_CONTENT_LENGTH = 6;

export type KnowledgeGap = {
  sampleQuestion: string;
  occurrences: number;
  lastAskedAt: string;
  uniqueAskers: number;
};

export type KnowledgeGapsResult = {
  items: KnowledgeGap[];
  rangeDays: number;
  scannedMessages: number;
};

@Injectable()
export class KnowledgeGapsService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findGaps(args: {
    workspaceId: string;
    days?: number;
    minOccurrences?: number;
    limit?: number;
  }): Promise<KnowledgeGapsResult> {
    const days = clamp(args.days ?? GAPS_DEFAULT_DAYS, 1, GAPS_MAX_DAYS);
    const minOccurrences = Math.max(2, args.minOccurrences ?? GAPS_DEFAULT_MIN_OCCURRENCES);
    const limit = clamp(args.limit ?? GAPS_DEFAULT_LIMIT, 1, GAPS_MAX_LIMIT);
    const since = new Date(Date.now() - days * 86_400_000);

    // Single round-trip: count total scanned + grouped recurring questions.
    const scannedRow = await this.db
      .selectFrom('aiChatMessages')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('workspaceId', '=', args.workspaceId)
      .where('role', '=', 'user')
      .where('deletedAt', 'is', null)
      .where('createdAt', '>=', since)
      .executeTakeFirst();

    const scannedMessages = Number(scannedRow?.count ?? 0);

    if (scannedMessages === 0) {
      return { items: [], rangeDays: days, scannedMessages: 0 };
    }

    // Group by a normalized hash of the message content so that re-phrasings
    // with different whitespace/case still cluster. Filter out trivially short
    // messages — they're noise (single-word follow-ups, "thanks", etc.).
    const rows = await sql<{
      sample: string;
      occurrences: string;
      last_asked_at: Date;
      unique_askers: string;
    }>`
      SELECT
        (array_agg(content ORDER BY created_at DESC))[1] AS sample,
        count(*) AS occurrences,
        max(created_at) AS last_asked_at,
        count(DISTINCT user_id) AS unique_askers
      FROM ai_chat_messages
      WHERE workspace_id = ${args.workspaceId}
        AND role = 'user'
        AND deleted_at IS NULL
        AND created_at >= ${since}
        AND content IS NOT NULL
        AND length(trim(content)) >= ${GAPS_MIN_CONTENT_LENGTH}
      GROUP BY md5(lower(regexp_replace(trim(content), '\\s+', ' ', 'g')))
      HAVING count(*) >= ${minOccurrences}
      ORDER BY count(*) DESC, max(created_at) DESC
      LIMIT ${limit}
    `.execute(this.db);

    const items: KnowledgeGap[] = rows.rows.map((r) => ({
      sampleQuestion: r.sample,
      occurrences: Number(r.occurrences),
      lastAskedAt:
        r.last_asked_at instanceof Date
          ? r.last_asked_at.toISOString()
          : new Date(r.last_asked_at).toISOString(),
      uniqueAskers: Number(r.unique_askers),
    }));

    return { items, rangeDays: days, scannedMessages };
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
