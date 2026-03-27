-- Migration: Add unique constraint + extend watch_type check on source_watchlists
-- Date: 2026-03-15 (sorts before 20260316 so ON CONFLICT in later migrations works)
-- Purpose:
--   1. Add UNIQUE (platform, watch_value) so upserts work correctly
--   2. Add 'chat_id' to watch_type check (needed for Telegram bot private group tracking)

-- Add unique constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'source_watchlists'
      AND c.conname = 'source_watchlists_platform_watch_value_unique'
  ) THEN
    ALTER TABLE source_watchlists
      ADD CONSTRAINT source_watchlists_platform_watch_value_unique UNIQUE (platform, watch_value);
  END IF;
END $$;

-- Update watch_type check constraint to include 'chat_id' (idempotent: drop any existing, re-add)
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'source_watchlists'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%watch_type%'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE source_watchlists DROP CONSTRAINT ' || quote_ident(v_conname);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'source_watchlists'
      AND c.conname = 'source_watchlists_watch_type_check'
  ) THEN
    ALTER TABLE source_watchlists
      ADD CONSTRAINT source_watchlists_watch_type_check
      CHECK (watch_type IN ('author', 'channel', 'hashtag', 'keyword', 'url', 'symbol', 'chat_id'));
  END IF;
END $$;
