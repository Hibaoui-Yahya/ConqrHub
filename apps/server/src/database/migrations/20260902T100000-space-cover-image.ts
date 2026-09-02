import { Kysely, sql } from 'kysely';

// Plane-style cover banner for spaces (mirrors Plane's `projects.cover_image`).
// Holds either `static:image_N` (one of the bundled stock covers) or the
// stored file name of an uploaded `space-cover` attachment. NULL = default.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('spaces')
    .addColumn('cover_image', 'varchar', (col) => col)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('spaces').dropColumn('cover_image').execute();
}
