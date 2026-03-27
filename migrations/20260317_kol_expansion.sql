-- Migration: 擴充 Telegram / Threads / Instagram KOL 監控頻道
-- Date: 2026-03-17
-- New: 陳唯泰(eaglewealth), 郭哲榮分析師(a178178), 股海筋肉人(musclestock) Telegram
--      張真卿, 郭哲榮分析師 Threads
--      程世嘉, 小車, 郭哲榮分析師, 股市隱者 Instagram

INSERT INTO source_watchlists (platform, watch_type, watch_value, enabled, priority, created_at, updated_at)
VALUES
  -- Telegram 新增
  ('telegram', 'url', 'https://t.me/s/eaglewealth', true, 6, NOW(), NOW()),  -- 陳唯泰
  ('telegram', 'url', 'https://t.me/s/a178178',     true, 7, NOW(), NOW()),  -- 郭哲榮分析師
  ('telegram', 'url', 'https://t.me/s/musclestock',  true, 5, NOW(), NOW()),  -- 股海筋肉人
  -- Threads 補漏
  ('threads',  'author', 'zhangzhenqing', true, 5, NOW(), NOW()),             -- 張真卿
  ('threads',  'author', 's178178',       true, 7, NOW(), NOW()),             -- 郭哲榮分析師
  -- Instagram 補漏
  ('instagram', 'author', 'ikala_stevecc', true, 5, NOW(), NOW()),            -- 程世嘉
  ('instagram', 'author', 'sscar0202',     true, 5, NOW(), NOW()),            -- 小車
  ('instagram', 'author', 's178178',       true, 7, NOW(), NOW()),            -- 郭哲榮分析師
  ('instagram', 'author', 'hermittaiwan',  true, 5, NOW(), NOW())             -- 股市隱者
ON CONFLICT (platform, watch_value) DO UPDATE
  SET enabled    = true,
      priority   = EXCLUDED.priority,
      updated_at = NOW();
