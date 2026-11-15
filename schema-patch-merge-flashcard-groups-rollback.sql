-- Rollback of schema-patch-merge-flashcard-groups.sql (the function only; a union already made is undone by
-- its own rollback script, e.g. scripts/reorg/coluna-merge-TEST-ONLY-rollback.sql).
BEGIN;
DROP FUNCTION IF EXISTS merge_flashcard_groups(bigint, bigint, bigint[], text, uuid);
COMMIT;
