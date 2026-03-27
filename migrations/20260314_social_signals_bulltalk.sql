ALTER TABLE IF EXISTS social_signals
  DROP CONSTRAINT IF EXISTS social_signals_source_type_check;

ALTER TABLE IF EXISTS social_signals
  ADD CONSTRAINT social_signals_source_type_check
  CHECK (source_type IN ('PTT', 'Threads', 'KOL', 'BullTalk'));
