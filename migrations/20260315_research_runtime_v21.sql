ALTER TABLE source_discovery_queue
  DROP CONSTRAINT IF EXISTS source_discovery_queue_state_check;

ALTER TABLE source_discovery_queue
  ADD CONSTRAINT source_discovery_queue_state_check
  CHECK (state IN ('pending', 'approved', 'rejected', 'monitor_only'));

CREATE TABLE IF NOT EXISTS kol_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id UUID REFERENCES source_entities(id) ON DELETE CASCADE,
  display_name VARCHAR(255) NOT NULL,
  primary_platform VARCHAR(40) NOT NULL,
  profile_url TEXT,
  follower_count INTEGER,
  content_focus VARCHAR(80) NOT NULL DEFAULT 'tw_stocks',
  discovery_state VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (discovery_state IN ('approved', 'rejected', 'monitor_only', 'pending')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(primary_platform, display_name)
);

CREATE TABLE IF NOT EXISTS connector_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_name VARCHAR(40) NOT NULL,
  platform VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial', 'skipped')),
  records_written INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS source_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_run_id UUID REFERENCES connector_runs(id) ON DELETE CASCADE,
  platform VARCHAR(40) NOT NULL,
  source_entity_id UUID REFERENCES source_entities(id) ON DELETE SET NULL,
  target_url TEXT,
  snapshot_path TEXT,
  screenshot_path TEXT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id UUID REFERENCES source_entities(id) ON DELETE SET NULL,
  kol_profile_id UUID REFERENCES kol_profiles(id) ON DELETE SET NULL,
  platform VARCHAR(40) NOT NULL,
  podcast_name VARCHAR(255) NOT NULL,
  episode_title TEXT NOT NULL,
  episode_url TEXT NOT NULL,
  audio_url TEXT,
  external_id VARCHAR(255),
  published_at TIMESTAMPTZ,
  transcript_status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (transcript_status IN ('pending', 'ready', 'transcript_unavailable', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform, episode_url)
);

CREATE TABLE IF NOT EXISTS podcast_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_episode_id UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
  transcript_text TEXT NOT NULL,
  language VARCHAR(20),
  transcript_source VARCHAR(40) NOT NULL CHECK (transcript_source IN ('youtube_caption', 'rss', 'manual', 'other')),
  extracted_mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_thesis JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(podcast_episode_id)
);

CREATE INDEX IF NOT EXISTS idx_kol_profiles_platform_followers ON kol_profiles(primary_platform, follower_count DESC);
CREATE INDEX IF NOT EXISTS idx_connector_runs_platform_started ON connector_runs(platform, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_audits_connector_run ON source_audits(connector_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_platform_published ON podcast_episodes(platform, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_transcripts_episode ON podcast_transcripts(podcast_episode_id);
