#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const KOLS = [
  {
    displayName: '股癌',
    primaryPlatform: 'youtube',
    profileUrl: 'https://www.youtube.com/@stockcancer',
    followerCount: 500000,
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@stockcancer',
      instagramUrl: 'https://www.instagram.com/stockcancer/',
      threadsUsername: 'stockcancer',
      telegramUrl: 'https://t.me/s/Gooaye',
      podcastName: '股癌 Gooaye',
      spotifyUrl: 'https://open.spotify.com/show/6xkNsQwVfWaB6MvdYhD5pW',
      appleUrl: 'https://podcasts.apple.com/tw/podcast/id1535838033',
    },
  },
  {
    displayName: '投資癮',
    primaryPlatform: 'youtube',
    profileUrl: 'https://www.youtube.com/@investaddict',
    followerCount: 40000,
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@investaddict',
      instagramUrl: 'https://www.instagram.com/investaddict_tw/',
      podcastName: '投資癮',
      keywords: ['台股', '交易', '資金流向'],
    },
  },
  {
    displayName: '定錨投筆',
    primaryPlatform: 'investanchors',
    profileUrl: 'https://investanchors.com/',
    followerCount: 15000,
    metadata: {
      investanchorsUrl: 'https://investanchors.com/',
      podcastName: '定錨投筆',
      telegramUrl: 'https://t.me/s/investanchors',
    },
  },
  {
    displayName: '游庭皓的財經皓角',
    primaryPlatform: 'youtube',
    profileUrl: 'https://www.youtube.com/@yutinghaofinance',
    followerCount: 600000,
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@yutinghaofinance',
      youtubeChannelId: 'UC0lbAQVpenvfA2QqzsRtL_g',
      podcastName: '游庭皓的財經皓角',
      appleUrl: 'https://podcasts.apple.com/tw/podcast/id1488295306',
      keywords: ['台股', '產業趨勢', '資金流向', '總經', '財經皓角'],
    },
  },
  {
    displayName: 'M觀點',
    primaryPlatform: 'youtube',
    profileUrl: 'https://www.youtube.com/channel/UCT3uWFvKLVpRnEealmRwvrw',
    followerCount: 180000,
    metadata: {
      youtubeUrl: 'https://www.youtube.com/channel/UCT3uWFvKLVpRnEealmRwvrw',
      youtubeChannelId: 'UCT3uWFvKLVpRnEealmRwvrw',
      podcastName: 'M觀點 | 科技X商業X投資',
      websiteUrl: 'https://miula.tw/miula_perspective/',
      keywords: ['科技趨勢', 'AI', '半導體', '投資觀點'],
    },
  },
  {
    displayName: '財經M平方',
    primaryPlatform: 'youtube',
    profileUrl: 'https://www.youtube.com/channel/UC6LU7FUBvbFCh_cQasrHZ_Q',
    followerCount: 120000,
    metadata: {
      youtubeUrl: 'https://www.youtube.com/channel/UC6LU7FUBvbFCh_cQasrHZ_Q',
      youtubeChannelId: 'UC6LU7FUBvbFCh_cQasrHZ_Q',
      podcastName: 'MacroMicro 財經M平方',
      appleUrl: 'https://podcasts.apple.com/tw/podcast/id1522682178',
      websiteUrl: 'https://www.macromicro.me/video',
      keywords: ['總經', '台股', '半導體', '景氣循環', '資金流向'],
    },
  },
  {
    displayName: '股市隱者',
    primaryPlatform: 'youtube',
    profileUrl: 'https://www.youtube.com/@stockhermit',
    followerCount: 35000,
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@stockhermit',
      instagramUrl: 'https://www.instagram.com/hermittaiwan/',
      podcastName: '股市隱者',
    },
  },
  {
    displayName: '財報狗',
    primaryPlatform: 'podcast',
    profileUrl: 'https://podcasts.apple.com/tw/podcast/id1513810531',
    followerCount: 90000,
    metadata: {
      podcastName: '財報狗 - 掌握台股美股時事議題',
      appleUrl: 'https://podcasts.apple.com/tw/podcast/id1513810531',
      youtubeUrl: 'https://www.youtube.com/@StatementdogAcademy',
      websiteUrl: 'https://statementdog.com/',
      keywords: ['財報', '產業循環', '台股', '基本面'],
    },
  },
  {
    displayName: 'John 林睿閔',
    primaryPlatform: 'telegram',
    profileUrl: 'https://t.me/johnstock888',
    followerCount: 30000,
    metadata: {
      telegramUrl: 'https://t.me/s/johnstock888',
      keywords: ['台股', '籌碼', '被動元件', '半導體'],
    },
  },
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function sourceKeySegment(value) {
  const ascii = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return ascii || encodeURIComponent(value).replace(/%/g, '').toLowerCase().slice(0, 100);
}

function env() {
  loadEnvFile(path.join(process.cwd(), '.env'));
  loadEnvFile(path.join(process.cwd(), 'web', '.env'));
  loadEnvFile(path.join(process.cwd(), 'web', '.env.local'));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('missing_supabase_env');
  return { url: url.replace(/\/$/, ''), key };
}

async function rest(pathname, options = {}) {
  const { url, key } = env();
  const res = await fetch(`${url}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=representation,resolution=merge-duplicates',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathname}_${res.status}_${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const inserted = [];
  for (const kol of KOLS) {
    const sourceKey = `kol.${sourceKeySegment(kol.displayName)}.${kol.primaryPlatform}`;
    const entityRows = await rest('source_entities?on_conflict=source_key', {
      method: 'POST',
      body: JSON.stringify({
        platform: kol.primaryPlatform,
        entity_type: 'kol',
        display_name: kol.displayName,
        source_key: sourceKey,
        profile_url: kol.profileUrl,
        metadata: kol.metadata,
        status: 'active',
        updated_at: new Date().toISOString(),
      }),
    });
    const entity = Array.isArray(entityRows) ? entityRows[0] : entityRows;
    await rest('kol_profiles?on_conflict=primary_platform,display_name', {
      method: 'POST',
      body: JSON.stringify({
        source_entity_id: entity?.id || null,
        display_name: kol.displayName,
        primary_platform: kol.primaryPlatform,
        profile_url: kol.profileUrl,
        follower_count: kol.followerCount,
        content_focus: 'tw_stocks',
        discovery_state: 'approved',
        metadata: kol.metadata,
        updated_at: new Date().toISOString(),
      }),
    });
    inserted.push(kol.displayName);
  }
  console.log(`KOL registry repaired: ${inserted.join(', ')}`);
}

main().catch((error) => {
  console.error(`repair_kol_registry failed: ${error.message}`);
  process.exit(1);
});
