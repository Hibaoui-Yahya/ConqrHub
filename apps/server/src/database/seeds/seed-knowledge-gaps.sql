-- Seed recurring AI-chat questions so the Knowledge Gaps card renders gaps,
-- which exercises the v1.6 "Create page" chip end-to-end.
--
-- Idempotent: re-running deletes prior rows tagged `[seed]` and re-creates them.
--
-- How to run:
--   railway connect Postgres            # or your psql connection of choice
--   \i apps/server/src/database/seeds/seed-knowledge-gaps.sql
--
-- Or one-liner:
--   psql "$DATABASE_URL" -f apps/server/src/database/seeds/seed-knowledge-gaps.sql
--
-- Picks the first workspace + first active user automatically. To target a
-- specific workspace, set the psql variable `workspace_id` before running:
--   psql "$DATABASE_URL" -v workspace_id="'<uuid>'" -f ...

BEGIN;

DO $$
DECLARE
  v_workspace_id uuid;
  v_user_id      uuid;
  v_chat_id      uuid;
  v_now          timestamptz := now();
  v_day          interval     := interval '1 day';
  v_question     text;
  v_occurrences  int;
  v_spread_days  int;
  v_variants     text[];
  v_inserted     int := 0;
  i              int;
  v_age_ms       double precision;
  v_asked_at     timestamptz;
BEGIN
  -- 1) Pick workspace + user. Override workspace by editing this query.
  SELECT id INTO v_workspace_id
  FROM workspaces
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'No workspace found. Create one via /setup before seeding.';
  END IF;

  SELECT id INTO v_user_id
  FROM users
  WHERE workspace_id = v_workspace_id
    AND deleted_at IS NULL
    AND deactivated_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No active user found in workspace %', v_workspace_id;
  END IF;

  RAISE NOTICE 'Seeding knowledge gaps in workspace % as user %', v_workspace_id, v_user_id;

  -- 2) Wipe prior seed rows for idempotency.
  DELETE FROM ai_chat_messages
   WHERE chat_id IN (
     SELECT id FROM ai_chats
      WHERE workspace_id = v_workspace_id
        AND title LIKE '[seed]%'
   );

  DELETE FROM ai_chats
   WHERE workspace_id = v_workspace_id
     AND title LIKE '[seed]%';

  -- 3) Create the seed thread.
  v_chat_id := gen_uuid_v7();
  INSERT INTO ai_chats (id, workspace_id, creator_id, title, created_at, updated_at)
  VALUES (v_chat_id, v_workspace_id, v_user_id, '[seed] Demo questions', v_now, v_now);

  -- 4) Insert recurring question batches. Each row needs `length(trim(content)) >= 6`
  --    and `role = 'user'`. The service groups by md5(lower(regexp_replace(...))) so
  --    case/whitespace variants still cluster.
  FOR v_question, v_occurrences, v_spread_days IN
    SELECT * FROM (VALUES
      ('How do I reset my MFA?',                    6, 14),
      ('Where is the on-call rotation calendar?',   4, 10),
      ('What is the data retention policy?',        3, 21),
      ('Who owns the billing-events service?',      3,  7)
    ) AS q(question, occurrences, spread_days)
  LOOP
    v_variants := ARRAY[
      v_question,
      lower(v_question),
      '  ' || v_question || '  ',
      regexp_replace(v_question, '\s+', '  ', 'g')
    ];

    FOR i IN 0 .. v_occurrences - 1 LOOP
      v_age_ms   := (v_spread_days::double precision / GREATEST(1, v_occurrences - 1)) * i;
      v_asked_at := v_now - (v_age_ms * v_day);

      INSERT INTO ai_chat_messages
        (id, chat_id, workspace_id, user_id, role, content, created_at, updated_at)
      VALUES
        (gen_uuid_v7(), v_chat_id, v_workspace_id, v_user_id, 'user',
         v_variants[(i % array_length(v_variants, 1)) + 1],
         v_asked_at, v_asked_at);

      v_inserted := v_inserted + 1;
    END LOOP;
  END LOOP;

  -- 5) A few one-offs that should NOT cluster (occurrences < 2 → filtered out).
  FOR v_question IN
    SELECT unnest(ARRAY[
      'Can I install Docker on Windows ARM?',
      'Is there a quarterly OKR template?',
      'What time does the standup start?'
    ])
  LOOP
    INSERT INTO ai_chat_messages
      (id, chat_id, workspace_id, user_id, role, content, created_at, updated_at)
    VALUES
      (gen_uuid_v7(), v_chat_id, v_workspace_id, v_user_id, 'user', v_question,
       v_now - (3 * v_day), v_now - (3 * v_day));
    v_inserted := v_inserted + 1;
  END LOOP;

  RAISE NOTICE 'Seeded % chat messages (4 recurring topics + 3 one-offs)', v_inserted;
END $$;

COMMIT;

-- After running, hit /settings/health as an admin. The Knowledge Gaps card
-- should show 4 recurring questions, each with a "Create a page titled ..."
-- chip. Click it:
--   - If the question's words FTS-match an existing page, the new page lands
--     in that page's space immediately (no modal).
--   - If there's no FTS match, the space-picker modal opens. Pick → confirm.
