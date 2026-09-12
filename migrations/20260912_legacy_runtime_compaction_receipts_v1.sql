BEGIN;

-- Auditable receipt for compaction performed only on an already restored,
-- offline copy. This migration creates the append-only evidence table; it does
-- not delete or compact any production rows.
CREATE TABLE IF NOT EXISTS public.stockinsider_legacy_compaction_receipts_v1 (
  receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version TEXT NOT NULL CHECK (policy_version = 'legacy-runtime-v1'),
  source_high_water_at TIMESTAMPTZ NOT NULL,
  live_detail_cutoff_at TIMESTAMPTZ NOT NULL,
  archived_run_count BIGINT NOT NULL CHECK (archived_run_count >= 0),
  archived_run_root_hash TEXT NOT NULL CHECK (archived_run_root_hash ~ '^[0-9a-f]{64}$'),
  removed_relation_counts JSONB NOT NULL CHECK (jsonb_typeof(removed_relation_counts) = 'object'),
  retained_relation_counts JSONB NOT NULL CHECK (jsonb_typeof(retained_relation_counts) = 'object'),
  cold_backup_id TEXT NOT NULL,
  cold_backup_plaintext_sha256 TEXT NOT NULL CHECK (cold_backup_plaintext_sha256 ~ '^[0-9a-f]{64}$'),
  cold_restore_verified BOOLEAN NOT NULL CHECK (cold_restore_verified),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (live_detail_cutoff_at <= source_high_water_at)
);

ALTER TABLE public.stockinsider_legacy_compaction_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stockinsider_legacy_compaction_receipts_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.stockinsider_legacy_compaction_receipts_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.reject_stockinsider_compaction_receipt_mutation_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
BEGIN
  RAISE EXCEPTION 'stockinsider_compaction_receipt_is_immutable';
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_stockinsider_compaction_receipt_mutation_v1() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stockinsider_compaction_receipt_immutable_v1
  ON public.stockinsider_legacy_compaction_receipts_v1;
CREATE TRIGGER trg_stockinsider_compaction_receipt_immutable_v1
  BEFORE UPDATE OR DELETE ON public.stockinsider_legacy_compaction_receipts_v1
  FOR EACH ROW EXECUTE FUNCTION public.reject_stockinsider_compaction_receipt_mutation_v1();

COMMIT;
