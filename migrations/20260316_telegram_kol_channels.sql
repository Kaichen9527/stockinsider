-- Migration: 新增股癌 (Gooaye) 和 John 林睿閔 Telegram 公開頻道監控
-- Date: 2026-03-16
-- Purpose: 讓 scrapeTelegram() 開始抓取這兩個高流量台股 KOL 頻道

INSERT INTO source_watchlists (platform, watch_type, watch_value, enabled, priority, created_at, updated_at)
VALUES
  ('telegram', 'url', 'https://t.me/s/Gooaye',       true, 8, NOW(), NOW()),  -- 股癌 (gooaye) ~50萬追蹤
  ('telegram', 'url', 'https://t.me/s/johnstock888', true, 7, NOW(), NOW())   -- John 林睿閔 ~3萬追蹤
ON CONFLICT (platform, watch_value) DO UPDATE
  SET enabled    = true,
      priority   = EXCLUDED.priority,
      updated_at = NOW();
