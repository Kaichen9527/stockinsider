ALTER TABLE IF EXISTS recommendations
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(16),
  ADD COLUMN IF NOT EXISTS community_signal_score NUMERIC,
  ADD COLUMN IF NOT EXISTS conditional_recommendation_note TEXT;

ALTER TABLE IF EXISTS story_candidates
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(16),
  ADD COLUMN IF NOT EXISTS conditional_recommendation_note TEXT;

ALTER TABLE IF EXISTS theme_heat
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(16),
  ADD COLUMN IF NOT EXISTS latest_source_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS social_signals
  ADD COLUMN IF NOT EXISTS source_url TEXT;

ALTER TABLE IF EXISTS recommendations
  DROP CONSTRAINT IF EXISTS recommendations_recommendation_state_check;

ALTER TABLE IF EXISTS story_candidates
  DROP CONSTRAINT IF EXISTS story_candidates_thesis_state_check;

ALTER TABLE IF EXISTS research_memos
  DROP CONSTRAINT IF EXISTS research_memos_recommendation_state_check;

UPDATE recommendations
SET recommendation_state = 'signal_candidate'
WHERE recommendation_state = 'watchlist_candidate';

UPDATE story_candidates
SET thesis_state = 'signal_candidate'
WHERE thesis_state = 'watchlist_candidate';

UPDATE research_memos
SET recommendation_state = 'signal_candidate'
WHERE recommendation_state = 'watchlist_candidate';

ALTER TABLE IF EXISTS recommendations
  ALTER COLUMN recommendation_state SET DEFAULT 'signal_candidate';

ALTER TABLE IF EXISTS story_candidates
  ALTER COLUMN thesis_state SET DEFAULT 'signal_candidate';

ALTER TABLE IF EXISTS recommendations
  ADD CONSTRAINT recommendations_recommendation_state_check
  CHECK (recommendation_state IN ('signal_candidate', 'partially_verified', 'validated_thesis', 'actionable_setup'));

ALTER TABLE IF EXISTS story_candidates
  ADD CONSTRAINT story_candidates_thesis_state_check
  CHECK (thesis_state IN ('signal_candidate', 'partially_verified', 'validated_thesis', 'actionable_setup', 'review', 'rejected'));

ALTER TABLE IF EXISTS research_memos
  ADD CONSTRAINT research_memos_recommendation_state_check
  CHECK (recommendation_state IS NULL OR recommendation_state IN ('signal_candidate', 'partially_verified', 'validated_thesis', 'actionable_setup'));
