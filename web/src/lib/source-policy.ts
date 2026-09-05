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
  'twstockanalysis',
  'Gooaye',
  'johnstock888',
  'eaglewealth',
  'a178178',
  'musclestock',
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

function hasAuthorizedPodcastRss(value: string | undefined): boolean {
  return String(value || '').split(',').map((item) => item.trim()).some((item) => /^https:\/\//u.test(item));
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
    return enabled(process.env.THREADS_OFFICIAL_API_ENABLED)
      ? { connector, disposition: 'active', licenseBasis: 'threads_official_api', terminalReason: null, cadenceHours: 6 }
      : { connector, disposition: 'blocked_auth', licenseBasis: 'threads_official_api', terminalReason: 'threads_app_review_or_vault_token_pending', cadenceHours: 6 };
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
    return hasAuthorizedPodcastRss(process.env.PODCAST_RSS_ALLOWLIST)
      ? { connector, disposition: 'active', licenseBasis: 'creator_published_rss_allowlist', terminalReason: null, cadenceHours: 24 }
      : { connector, disposition: 'manual_only', licenseBasis: 'creator_published_rss_required', terminalReason: 'podcast_rss_allowlist_missing', cadenceHours: null };
  }
  if (connector === 'gdelt') {
    return { connector, disposition: 'active', licenseBasis: 'gdelt_metadata_and_source_links', terminalReason: null, cadenceHours: 6 };
  }
  if (connector === 'twse_insider') {
    return { connector, disposition: 'active', licenseBasis: 'twse_open_data', terminalReason: null, cadenceHours: 24 };
  }
  return { connector, disposition: 'retired', licenseBasis: 'unsupported_connector', terminalReason: 'connector_not_approved', cadenceHours: null };
}

export function activeSourceConnectorKeys(): string[] {
  return CLOUD_SOURCE_CONNECTORS.filter((connector) => sourceExecutionPolicy(connector).disposition === 'active');
}

export function scheduledSourceConnectorKeys(): string[] {
  return activeSourceConnectorKeys();
}
