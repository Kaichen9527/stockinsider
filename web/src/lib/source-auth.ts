import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { getSupabaseServerClient } from './supabase-server';

export type MetaPlatform = 'threads' | 'instagram';

export const THREADS_CANONICAL_ORIGIN = 'https://www.threads.com';
export const THREADS_LEGACY_ORIGIN = 'https://www.threads.net';
export const THREADS_CANONICAL_DOMAIN = '.threads.com';
export const THREADS_LEGACY_DOMAIN = '.threads.net';

export type MetaCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  expires?: number;
};

export type PersistedMetaSessionState = {
  platform: MetaPlatform;
  cookies: MetaCookie[];
  userAgent: string | null;
  createdAt: string;
  validatedAt: string | null;
  expiredAt: string | null;
  lastSuccessfulUrl: string | null;
  lastDegradedReason: string | null;
};

export type MetaAuthConfig = {
  platform: MetaPlatform;
  username: string;
  password: string;
  hasCredential: boolean;
  sessionStatePath: string;
  fallbackCookies: MetaCookie[];
  fallbackCookieSource: 'namespaced_env' | 'env_section' | 'legacy_shared' | 'none';
  fallbackCookieNames: string[];
  missingRecommendedCookieNames: string[];
  envLastModifiedAt: string | null;
  duplicateLegacyKeys: string[];
  configError: string | null;
  configWarning: string | null;
};

type ResolveMetaAuthConfigOptions = {
  allowLegacyFallback?: boolean;
  ignoreFallbackCookies?: boolean;
};

const ROOT_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), '..');
const ENV_FILES = [path.join(/*turbopackIgnore: true*/ ROOT_DIR, '.env'),
  path.join(/*turbopackIgnore: true*/ ROOT_DIR, '.env.local')];
const LEGACY_META_COOKIE_KEYS = ['sessionid', 'csrftoken', 'ds_user_id', 'ig_did', 'mid', 'datr', 'ps_l', 'ps_n'] as const;

type LegacyEnvSnapshot = {
  duplicateLegacyKeys: string[];
  sections: Record<'threads' | 'instagram', Record<string, string>>;
  shared: Record<string, string>;
  envLastModifiedAt: string | null;
};

const RECOMMENDED_META_COOKIE_NAMES = ['sessionid', 'csrftoken', 'ds_user_id'] as const;

function compactText(value: unknown) {
  return String(value || '').trim();
}

function firstNonEmpty(...values: Array<unknown>) {
  for (const value of values) {
    const text = compactText(value);
    if (text) return text;
  }
  return '';
}

function parseEnvFileSections(): LegacyEnvSnapshot {
  const keyCounts = new Map<string, number>();
  const sections: Record<'threads' | 'instagram', Record<string, string>> = {
    threads: {},
    instagram: {},
  };
  const shared: Record<string, string> = {};
  let currentSection: 'threads' | 'instagram' | null = null;
  let envLastModifiedAt: string | null = null;

  for (const filePath of ENV_FILES) {
    if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) continue;
    try {
      const mtime = fs.statSync(/*turbopackIgnore: true*/ filePath).mtime;
      if (!envLastModifiedAt || mtime.getTime() > new Date(envLastModifiedAt).getTime()) {
        envLastModifiedAt = mtime.toISOString();
      }
    } catch {
      // best-effort diagnostics only
    }
    const content = fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('#')) {
        const normalized = line.toLowerCase();
        if (normalized.includes('thread')) currentSection = 'threads';
        else if (normalized.includes('instgram') || normalized.includes('instagram')) currentSection = 'instagram';
        continue;
      }
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (LEGACY_META_COOKIE_KEYS.includes(key as (typeof LEGACY_META_COOKIE_KEYS)[number])) {
        keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
        if (currentSection) sections[currentSection][key] = value;
        if (!shared[key]) shared[key] = value;
      }
    }
  }

  return {
    duplicateLegacyKeys: Array.from(keyCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
    sections,
    shared,
    envLastModifiedAt,
  };
}

function namespacedCookieValues(platform: MetaPlatform) {
  const prefix = platform === 'threads' ? 'THREADS_COOKIE_FALLBACK_' : 'INSTAGRAM_COOKIE_FALLBACK_';
  return {
    sessionid: compactText(process.env[`${prefix}SESSIONID`]),
    csrftoken: compactText(process.env[`${prefix}CSRFTOKEN`]),
    ds_user_id: compactText(process.env[`${prefix}DS_USER_ID`]),
    ig_did: compactText(process.env[`${prefix}IG_DID`]),
    mid: compactText(process.env[`${prefix}MID`]),
    datr: compactText(process.env[`${prefix}DATR`]),
    ps_l: compactText(process.env[`${prefix}PS_L`]),
    ps_n: compactText(process.env[`${prefix}PS_N`]),
  };
}

function makeMetaCookies(platform: MetaPlatform, values: Record<string, string>) {
  const domains = platform === 'threads' ? [THREADS_CANONICAL_DOMAIN, THREADS_LEGACY_DOMAIN] : ['.instagram.com'];
  return Object.entries(values)
    .filter(([, value]) => compactText(value))
    .flatMap(([name, value]) =>
      domains.map((domain) => ({
        name,
        value,
        domain,
        path: '/',
        httpOnly: false,
        secure: true,
      })),
    );
}

function presentCookieNames(values: Record<string, string>) {
  return Object.entries(values)
    .filter(([, value]) => compactText(value))
    .map(([name]) => name)
    .sort();
}

function missingRecommendedCookieNames(values: Record<string, string>) {
  const present = new Set(presentCookieNames(values));
  return RECOMMENDED_META_COOKIE_NAMES.filter((name) => !present.has(name));
}

export function resolveMetaAuthConfig(platform: MetaPlatform, options?: ResolveMetaAuthConfigOptions): MetaAuthConfig {
  const envSnapshot = parseEnvFileSections();
  const namespaced = namespacedCookieValues(platform);
  const sectionValues = envSnapshot.sections[platform];
  const legacyValues = Object.fromEntries(
    LEGACY_META_COOKIE_KEYS.map((key) => [key, compactText(process.env[key])]),
  );
  const namespacedCookies = makeMetaCookies(platform, namespaced);
  const sectionCookies = makeMetaCookies(platform, sectionValues);
  const legacySharedCookies = makeMetaCookies(platform, legacyValues);
  const allowLegacyFallback = options?.allowLegacyFallback !== false;
  const ignoreFallbackCookies = Boolean(options?.ignoreFallbackCookies);

  let fallbackCookies: MetaCookie[] = [];
  let fallbackCookieSource: MetaAuthConfig['fallbackCookieSource'] = 'none';
  let fallbackValues: Record<string, string> = {};
  if (!ignoreFallbackCookies && namespacedCookies.length > 0) {
    fallbackCookies = namespacedCookies;
    fallbackCookieSource = 'namespaced_env';
    fallbackValues = namespaced;
  } else if (!ignoreFallbackCookies && allowLegacyFallback && sectionCookies.length > 0) {
    fallbackCookies = sectionCookies;
    fallbackCookieSource = 'env_section';
    fallbackValues = sectionValues;
  } else if (!ignoreFallbackCookies && allowLegacyFallback && legacySharedCookies.length > 0) {
    fallbackCookies = legacySharedCookies;
    fallbackCookieSource = 'legacy_shared';
    fallbackValues = legacyValues;
  }

  const username =
    platform === 'threads'
      ? firstNonEmpty(process.env.THREADS_USERNAME, process.env.THREADS_EMAIL, process.env.META_USERNAME, process.env.META_EMAIL)
      : firstNonEmpty(process.env.INSTAGRAM_USERNAME, process.env.INSTAGRAM_EMAIL, process.env.META_USERNAME, process.env.META_EMAIL);
  const password =
    platform === 'threads'
      ? firstNonEmpty(process.env.THREADS_PASSWORD, process.env.META_PASSWORD)
      : firstNonEmpty(process.env.INSTAGRAM_PASSWORD, process.env.META_PASSWORD);

  const duplicateLegacyKeys = envSnapshot.duplicateLegacyKeys;
  const configWarning =
    duplicateLegacyKeys.length > 0 && namespacedCookies.length === 0 && sectionCookies.length === 0
      ? `duplicate legacy Meta cookie keys detected without platform section comments: ${duplicateLegacyKeys.join(', ')}`
      : null;
  const configError = configWarning;

  const sessionStatePath = firstNonEmpty(
    platform === 'threads' ? process.env.THREADS_SESSION_STATE : process.env.INSTAGRAM_SESSION_STATE,
    path.join(/*turbopackIgnore: true*/ ROOT_DIR, '.agent', 'vendor', `${platform}-session.json`),
  );

  return {
    platform,
    username,
    password,
    hasCredential: Boolean(username && password),
    sessionStatePath,
    fallbackCookies,
    fallbackCookieSource,
    fallbackCookieNames: presentCookieNames(fallbackValues),
    missingRecommendedCookieNames: missingRecommendedCookieNames(fallbackValues),
    envLastModifiedAt: envSnapshot.envLastModifiedAt,
    duplicateLegacyKeys,
    configError,
    configWarning,
  };
}

export function resolveInvestAnchorsCredential() {
  const account = firstNonEmpty(process.env.INVESTANCHORS_ACCOUNT, process.env.Account);
  const password = firstNonEmpty(process.env.INVESTANCHORS_PASSWORD, process.env.Password);
  return {
    account,
    password,
    hasCredential: Boolean(account && password),
  };
}

export function summarizeMetaEnvConfig() {
  const threads = resolveMetaAuthConfig('threads');
  const instagram = resolveMetaAuthConfig('instagram');
  return {
    threads: {
      fallbackCookieSource: threads.fallbackCookieSource,
      fallbackCookieNames: threads.fallbackCookieNames,
      missingRecommendedCookieNames: threads.missingRecommendedCookieNames,
      envLastModifiedAt: threads.envLastModifiedAt,
      duplicateLegacyKeys: threads.duplicateLegacyKeys,
      configError: threads.configError,
      configWarning: threads.configWarning,
      hasCredential: threads.hasCredential,
      sessionStatePath: threads.sessionStatePath,
    },
    instagram: {
      fallbackCookieSource: instagram.fallbackCookieSource,
      fallbackCookieNames: instagram.fallbackCookieNames,
      missingRecommendedCookieNames: instagram.missingRecommendedCookieNames,
      envLastModifiedAt: instagram.envLastModifiedAt,
      duplicateLegacyKeys: instagram.duplicateLegacyKeys,
      configError: instagram.configError,
      configWarning: instagram.configWarning,
      hasCredential: instagram.hasCredential,
      sessionStatePath: instagram.sessionStatePath,
    },
  };
}

export type MetaSessionStore = {
  load: () => PersistedMetaSessionState | null;
  persist: (state: PersistedMetaSessionState) => void;
  clear: () => void;
  loadCloud: () => Promise<PersistedMetaSessionState | null>;
  persistCloud: (state: PersistedMetaSessionState) => Promise<boolean>;
  clearCloud: (failureReason?: string | null) => Promise<void>;
  loadPreferred: () => Promise<PersistedMetaSessionState | null>;
  persistPreferred: (state: PersistedMetaSessionState) => Promise<void>;
  clearPreferred: (failureReason?: string | null) => Promise<void>;
};

type EncryptedPayload = {
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
};

function sessionEncryptionKey() {
  const raw = firstNonEmpty(
    process.env.SOURCE_SESSION_ENCRYPTION_KEY,
    process.env.SESSION_ENCRYPTION_KEY,
    process.env.INTERNAL_API_KEY,
    process.env.SUPABASE_SERVICE_KEY,
  );
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptSessionPayload(state: PersistedMetaSessionState): EncryptedPayload | null {
  const key = sessionEncryptionKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptSessionPayload(payload: unknown): PersistedMetaSessionState | null {
  const key = sessionEncryptionKey();
  if (!key || !payload || typeof payload !== 'object') return null;
  const encrypted = payload as Partial<EncryptedPayload>;
  if (encrypted.version !== 1 || encrypted.algorithm !== 'aes-256-gcm' || !encrypted.iv || !encrypted.tag || !encrypted.ciphertext) {
    return null;
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const parsed = JSON.parse(plain) as PersistedMetaSessionState;
    return parsed && Array.isArray(parsed.cookies) ? parsed : null;
  } catch {
    return null;
  }
}

function sessionMetadata(state: PersistedMetaSessionState) {
  const cookieDomains = Array.from(new Set((state.cookies || []).map((cookie) => cookie.domain).filter(Boolean)));
  const cookieExpirations = (state.cookies || [])
    .map((cookie) => (typeof cookie.expires === 'number' ? cookie.expires : null))
    .filter((value): value is number => value != null && value > 0);
  const minExpiration = cookieExpirations.length > 0 ? Math.min(...cookieExpirations) : null;
  return {
    cookieDomains,
    cookieCount: state.cookies?.length || 0,
    expiresAt: state.expiredAt || (minExpiration ? new Date(minExpiration * 1000).toISOString() : null),
  };
}

export function createMetaSessionStore(platform: MetaPlatform, sessionStatePath: string): MetaSessionStore {
  const store = {
    load(): PersistedMetaSessionState | null {
      try {
        if (!fs.existsSync(/*turbopackIgnore: true*/ sessionStatePath)) return null;
        const raw = fs.readFileSync(/*turbopackIgnore: true*/ sessionStatePath, 'utf8');
        const parsed = JSON.parse(raw) as PersistedMetaSessionState;
        if (!parsed || parsed.platform !== platform || !Array.isArray(parsed.cookies)) return null;
        return parsed;
      } catch {
        return null;
      }
    },
    persist(state: PersistedMetaSessionState) {
      const dir = path.dirname(sessionStatePath);
      fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
      fs.writeFileSync(/*turbopackIgnore: true*/ sessionStatePath, JSON.stringify(state, null, 2));
    },
    clear() {
      try {
        if (fs.existsSync(/*turbopackIgnore: true*/ sessionStatePath)) fs.unlinkSync(/*turbopackIgnore: true*/ sessionStatePath);
      } catch {
        // ignore cleanup failure
      }
    },
    async loadCloud(): Promise<PersistedMetaSessionState | null> {
      try {
        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
          .from('source_sessions')
          .select('platform,status,encrypted_payload')
          .eq('platform', platform)
          .eq('session_kind', 'meta')
          .maybeSingle();
        if (error || !data || data.status !== 'valid') return null;
        const parsed = decryptSessionPayload((data as { encrypted_payload?: unknown }).encrypted_payload);
        if (!parsed || parsed.platform !== platform || !Array.isArray(parsed.cookies)) return null;
        return parsed;
      } catch {
        return null;
      }
    },
    async persistCloud(state: PersistedMetaSessionState): Promise<boolean> {
      const encrypted = encryptSessionPayload(state);
      if (!encrypted) return false;
      try {
        const supabase = getSupabaseServerClient();
        const meta = sessionMetadata(state);
        const { error } = await supabase.from('source_sessions').upsert(
          {
            platform,
            session_kind: 'meta',
            status: 'valid',
            encrypted_payload: encrypted,
            cookie_domains: meta.cookieDomains,
            cookie_count: meta.cookieCount,
            validated_at: state.validatedAt,
            expires_at: meta.expiresAt,
            last_successful_url: state.lastSuccessfulUrl,
            failure_reason: state.lastDegradedReason,
            metadata: {
              migrated_from_local_path: sessionStatePath,
              has_user_agent: Boolean(state.userAgent),
              updated_by: 'stockinsider-runtime',
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'platform,session_kind' },
        );
        return !error;
      } catch {
        return false;
      }
    },
    async clearCloud(failureReason?: string | null): Promise<void> {
      try {
        const supabase = getSupabaseServerClient();
        await supabase.from('source_sessions').upsert(
          {
            platform,
            session_kind: 'meta',
            status: 'invalid',
            encrypted_payload: {},
            cookie_domains: [],
            cookie_count: 0,
            validated_at: null,
            expires_at: null,
            last_successful_url: null,
            failure_reason: failureReason || 'session_cleared',
            metadata: {
              cleared_local_path: sessionStatePath,
              updated_by: 'stockinsider-runtime',
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'platform,session_kind' },
        );
      } catch {
        // Cloud state is best-effort; local cleanup still runs below.
      }
    },
    async loadPreferred(): Promise<PersistedMetaSessionState | null> {
      const cloud = await this.loadCloud();
      if (cloud) return cloud;
      const local = this.load();
      if (local) {
        await this.persistCloud(local);
      }
      return local;
    },
    async persistPreferred(state: PersistedMetaSessionState): Promise<void> {
      const cloudPersisted = await this.persistCloud(state);
      if (!cloudPersisted) {
        this.persist(state);
        return;
      }
      // Supabase is now the preferred durable session store. Keep the old file as
      // migration fallback only if deletion fails silently.
      try {
        if (fs.existsSync(/*turbopackIgnore: true*/ sessionStatePath)) fs.unlinkSync(/*turbopackIgnore: true*/ sessionStatePath);
      } catch {
        // ignore
      }
    },
    async clearPreferred(failureReason?: string | null): Promise<void> {
      await this.clearCloud(failureReason);
      this.clear();
    },
  };
  return store;
}
