-- Migration: 新增推薦時間戳欄位 + 保留歷史推薦時間的 trigger
-- Date: 2026-03-17

-- 新增 first_recommended_at 欄位（記錄第一次推薦時間，絕不覆寫）
ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS first_recommended_at TIMESTAMPTZ;

-- 補填歷史資料：以 created_at 作為 first_recommended_at
UPDATE recommendations
SET first_recommended_at = created_at
WHERE first_recommended_at IS NULL;

-- Trigger function：確保 first_recommended_at 永遠保留最初值
CREATE OR REPLACE FUNCTION preserve_first_recommended_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.first_recommended_at IS NOT NULL THEN
    NEW.first_recommended_at = OLD.first_recommended_at;
  ELSIF NEW.first_recommended_at IS NULL THEN
    NEW.first_recommended_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_preserve_first_recommended_at ON recommendations;
CREATE TRIGGER trg_preserve_first_recommended_at
  BEFORE UPDATE ON recommendations
  FOR EACH ROW EXECUTE FUNCTION preserve_first_recommended_at();
