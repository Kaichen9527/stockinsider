export const RETIRED_SOURCE_CONNECTORS = ['youtube', 'googlenews', 'anue', 'udn', 'mobile01', 'instagram'] as const;
export const MANUAL_SOURCE_CONNECTORS = ['investanchors'] as const;
export const CLOUD_SOURCE_CONNECTORS = ['telegram', 'threads', 'ptt', 'podcast', 'bulltalk', 'gdelt', 'twse_insider'] as const;
export const SOURCE_CONNECTOR_KEYS = [
  ...CLOUD_SOURCE_CONNECTORS,
  ...MANUAL_SOURCE_CONNECTORS,
  ...RETIRED_SOURCE_CONNECTORS,
] as const;
export const APPROVED_TELEGRAM_PUBLIC_CHANNELS = [
  'investanchors',
  'Gooaye',
  'johnstock888',
  'eaglewealth',
  'a178178',
  'musclestock',
] as const;

/**
 * Channels retained in the source inventory but deliberately not fetched.
 * Keeping this explicit prevents an unavailable contact page from being
 * mistaken for a healthy empty channel or a parser regression.
 */
export const UNAVAILABLE_TELEGRAM_PUBLIC_CHANNELS = ['twstockanalysis'] as const;
export const CREATOR_PUBLISHED_PODCAST_RSS_INDEX_ALLOWLIST = [
  'https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml',
] as const;

export type SourcePolicyDisposition = 'active' | 'blocked_auth' | 'blocked_license' | 'manual_only' | 'retired';

export type SourceExecutionPolicy = {
  connector: string;
  disposition: SourcePolicyDisposition;
  licenseBasis: string;
  terminalReason: string | null;
  cadenceHours: number | null;
};

function enabled(value: string | undefined): boolean {
  return value === 'true';
}

function httpsRssList(value: string | undefined): string[] {
  return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter((item) => {
    try {
      return new URL(item).protocol === 'https:';
    } catch {
      return false;
    }
  }))];
}

export function authorizedPodcastRssAllowlist(value = process.env.PODCAST_RSS_ALLOWLIST): string[] {
  return [...new Set([...CREATOR_PUBLISHED_PODCAST_RSS_INDEX_ALLOWLIST, ...httpsRssList(value)])];
}

export function podcastContentAnalysisAllowlist(value = process.env.PODCAST_CONTENT_ANALYSIS_ALLOWLIST): string[] {
  return httpsRssList(value);
}

export function podcastContentAnalyzable(rssUrl: string, value = process.env.PODCAST_CONTENT_ANALYSIS_ALLOWLIST): boolean {
  return podcastContentAnalysisAllowlist(value).includes(rssUrl);
}

export function sourceExecutionPolicy(connector: string): SourceExecutionPolicy {
  if ((RETIRED_SOURCE_CONNECTORS as readonly string[]).includes(connector)) {
    return { connector, disposition: 'retired', licenseBasis: 'historical_audit_only', terminalReason: 'connector_retired', cadenceHours: null };
  }
  if ((MANUAL_SOURCE_CONNECTORS as readonly string[]).includes(connector)) {
    return {
      connector,
      disposition: 'manual_only',
      licenseBasis: 'private_research_lead_official_source_rederivation_only',
      terminalReason: 'official_source_rederivation_required',
      cadenceHours: null,
    };
  }
  if (connector === 'threads') {
    return enabled(process.env.THREADS_OFFICIAL_API_ENABLED) && enabled(process.env.THREADS_OFFICIAL_CANARY_ACTIVE)
      ? { connector, disposition: 'active', licenseBasis: 'threads_official_api', terminalReason: null, cadenceHours: 6 }
      : { connector, disposition: 'blocked_auth', licenseBasis: 'threads_official_api', terminalReason: enabled(process.env.THREADS_OFFICIAL_API_ENABLED) ? 'threads_official_canary_inactive' : 'threads_app_review_or_vault_token_pending', cadenceHours: 6 };
  }
  if (connector === 'telegram') {
    return enabled(process.env.TELEGRAM_PUBLIC_CHANNELS_AUTHORIZED)
      ? { connector, disposition: 'active', licenseBasis: 'approved_public_channel_metadata', terminalReason: null, cadenceHours: 6 }
      : { connector, disposition: 'blocked_license', licenseBasis: 'channel_use_attestation_required', terminalReason: 'telegram_channel_use_not_attested', cadenceHours: 6 };
  }
  if (connector === 'ptt') {
    return enabled(process.env.PTT_METADATA_AUTHORIZED)
      ? { connector, disposition: 'active', licenseBasis: 'metadata_link_only_attested', terminalReason: null, cadenceHours: 6 }
      : { connector, disposition: 'blocked_license', licenseBasis: 'metadata_use_attestation_required', terminalReason: 'ptt_metadata_use_not_attested', cadenceHours: 6 };
  }
  if (connector === 'bulltalk') {
    return enabled(process.env.BULLTALK_LICENSED) && Boolean(process.env.BULLTALK_AUTHORIZED_FEED_URL)
      ? { connector, disposition: 'active', licenseBasis: 'cmoney_partner_or_api_license', terminalReason: null, cadenceHours: 6 }
      : { connector, disposition: 'blocked_license', licenseBasis: 'cmoney_partner_license_required', terminalReason: 'bulltalk_authorized_feed_missing', cadenceHours: 6 };
  }
  if (connector === 'podcast') {
    return authorizedPodcastRssAllowlist().length > 0
      ? { connector, disposition: 'active', licenseBasis: 'creator_published_rss_index_allowlist', terminalReason: null, cadenceHours: 24 }
      : { connector, disposition: 'manual_only', licenseBasis: 'creator_published_rss_required', terminalReason: 'podcast_rss_allowlist_missing', cadenceHours: null };
  }
  if (connector === 'gdelt') {
    return { connector, disposition: 'active', licenseBasis: 'gdelt_metadata_and_source_links', terminalReason: null, cadenceHours: 6 };
  }
  if (connector === 'twse_insider') {
    return enabled(process.env.TWSE_OFFICIAL_OPENAPI_ENABLED)
      ? { connector, disposition: 'active', licenseBasis: 'twse_open_data', terminalReason: null, cadenceHours: 24 }
      : {
          connector,
          disposition: 'manual_only',
          licenseBasis: 'twse_open_data',
          terminalReason: 'twse_official_openapi_vps_egress_waf_blocked',
          cadenceHours: null,
        };
  }
  return { connector, disposition: 'retired', licenseBasis: 'unsupported_connector', terminalReason: 'connector_not_approved', cadenceHours: null };
}

export function activeSourceConnectorKeys(): string[] {
  return CLOUD_SOURCE_CONNECTORS.filter((connector) => sourceExecutionPolicy(connector).disposition === 'active');
}

export function scheduledSourceConnectorKeys(): string[] {
  return activeSourceConnectorKeys();
}
