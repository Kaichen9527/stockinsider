import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { InvestAnchorsGmailConfig } from './investanchors-gmail.ts';

type RuntimeEnvironment = Record<string, string | undefined>;
type NoticeCredentials = { gmail: InvestAnchorsGmailConfig; noticeHmacHex: string };

const credentialName = 'investanchors-gmail.json';
const credentialVersion = 'stockinsider-investanchors-gmail-v1';
const maxBytes = 16_384;
const sha256 = /^[a-f0-9]{64}$/u;
const exactKeys = 'clientId clientSecret mailboxSha256 noticeHmacHex refreshToken schemaVersion';

function isSecret(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && /^[!-~]+$/u.test(value);
}

function parseCredentials(value: unknown): NoticeCredentials | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(' ') !== exactKeys) return null;
  const { clientId, clientSecret, refreshToken, mailboxSha256, noticeHmacHex, schemaVersion } = value as Record<string, unknown>;
  if (schemaVersion !== credentialVersion || !isSecret(clientId) || !isSecret(clientSecret) || !isSecret(refreshToken)
    || typeof mailboxSha256 !== 'string' || !sha256.test(mailboxSha256)
    || typeof noticeHmacHex !== 'string' || !sha256.test(noticeHmacHex)) return null;
  return { gmail: { clientId, clientSecret, refreshToken, mailboxSha256 }, noticeHmacHex };
}

function readBoundedCredential(filename: string): Buffer {
  const descriptor = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const bytes = Buffer.alloc(maxBytes + 1);
  try {
    const file = fstatSync(descriptor);
    if (!file.isFile() || file.size < 1 || file.size > maxBytes) throw Error('investanchors_credential_invalid');
    const count = readSync(descriptor, bytes, 0, bytes.length, 0);
    if (count !== file.size) throw Error('investanchors_credential_invalid');
    return bytes.subarray(0, count);
  } catch (error) {
    bytes.fill(0);
    throw error;
  } finally {
    closeSync(descriptor);
  }
}

/** A present systemd credential is authoritative for all fields. An absent
 * credential keeps the existing environment-based deployment compatible. */
export function loadInvestAnchorsNoticeCredentials(
  env: RuntimeEnvironment = process.env,
  readCredential: (filename: string) => Buffer = readBoundedCredential,
): NoticeCredentials | null {
  if (env.CREDENTIALS_DIRECTORY !== undefined) {
    const directory = env.CREDENTIALS_DIRECTORY;
    if (!directory.startsWith('/run/credentials/') || directory !== resolve(directory)) {
      throw Error('investanchors_credential_invalid');
    }
    let bytes: Buffer | undefined;
    try {
      bytes = readCredential(join(directory, credentialName));
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw Error('investanchors_credential_invalid');
      }
    }
    if (bytes !== undefined) {
      try {
        if (bytes.length < 1 || bytes.length > maxBytes) throw Error('investanchors_credential_invalid');
        const config = parseCredentials(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
        if (config === null) throw Error('investanchors_credential_invalid');
        return config;
      } catch {
        throw Error('investanchors_credential_invalid');
      } finally {
        bytes.fill(0);
      }
    }
  }

  return parseCredentials({
    schemaVersion: credentialVersion,
    clientId: env.STOCKINSIDER_INVESTANCHORS_GMAIL_CLIENT_ID,
    clientSecret: env.STOCKINSIDER_INVESTANCHORS_GMAIL_CLIENT_SECRET,
    refreshToken: env.STOCKINSIDER_INVESTANCHORS_GMAIL_REFRESH_TOKEN,
    mailboxSha256: env.STOCKINSIDER_INVESTANCHORS_GMAIL_MAILBOX_SHA256,
    noticeHmacHex: env.STOCKINSIDER_INVESTANCHORS_NOTICE_HMAC_HEX,
  });
}
