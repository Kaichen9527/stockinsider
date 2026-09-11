import { createHash } from 'node:crypto';
import { spawn as spawnChild } from 'node:child_process';
import net from 'node:net';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES, type CandidateFinancialDocumentFormat } from './candidate-financial-documents.ts';

const MAX_PARSER_STDOUT_BYTES = 2 * 1024 * 1024;
const MAX_PARSER_STDERR_BYTES = 16 * 1024;
const PARSER_TIMEOUT_MS = 25_000;
const APPROVED_PYTHON_PATH = /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/u;
const PARSER_SOCKET_PATH = '/run/stockinsider/candidate-financial-parser.sock';

export type CandidateFinancialDocumentLocator = {
  page?: number;
  table?: number;
  xbrl_context?: string;
  xbrl_concept?: string;
};

export type CandidateFinancialLocalParserResult = {
  schema: 'candidate-financial-document-parser-v1';
  status: 'complete' | 'partial';
  parser: 'arelle' | 'pdfplumber' | 'docling';
  inputSha256: string;
  locators: CandidateFinancialDocumentLocator[];
  missingRequirements: string[];
  validation?: {
    errorCount: number;
    errorCodes: string[];
    validFactCount: number;
    errorsTruncated: boolean;
  };
  validatedFacts?: Array<{
    xbrl_context: string;
    xbrl_concept: string;
    value: string;
    unit: 'TWD' | 'TWD_per_share' | 'share';
  }>;
};

type Spawn = typeof spawnChild;

function validLocator(value: unknown): value is CandidateFinancialDocumentLocator {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const page = row.page;
  const table = row.table;
  const context = row.xbrl_context;
  const concept = row.xbrl_concept;
  return (page === undefined || (Number.isInteger(page) && Number(page) >= 1 && Number(page) <= 200))
    && (table === undefined || (Number.isInteger(table) && Number(table) >= 1 && Number(table) <= 20))
    && (context === undefined || (typeof context === 'string' && context.length <= 256))
    && (concept === undefined || (typeof concept === 'string' && concept.length <= 256))
    && Boolean(page || context || concept);
}

function parseResult(raw: string, inputSha256: string): CandidateFinancialLocalParserResult {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('candidate_financial_local_parser_invalid_json'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('candidate_financial_local_parser_invalid_shape');
  const result = parsed as Record<string, unknown>;
  if (result.schema !== 'candidate-financial-document-parser-v1' || result.inputSha256 !== inputSha256
    || !['complete', 'partial'].includes(String(result.status))
    || !['arelle', 'pdfplumber', 'docling'].includes(String(result.parser))
    || !Array.isArray(result.locators) || result.locators.length > 200 || !result.locators.every(validLocator)
    || !Array.isArray(result.missingRequirements) || result.missingRequirements.length > 32
    || !result.missingRequirements.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 240)
  ) throw new Error('candidate_financial_local_parser_invalid_shape');
  const validation = result.validation;
  const validatedFacts = result.validatedFacts;
  if (validation !== undefined && (!validation || typeof validation !== 'object' || Array.isArray(validation)
    || !Number.isInteger((validation as Record<string, unknown>).errorCount)
    || Number((validation as Record<string, unknown>).errorCount) < 0
    || !Number.isInteger((validation as Record<string, unknown>).validFactCount)
    || Number((validation as Record<string, unknown>).validFactCount) < 0
    || !Array.isArray((validation as Record<string, unknown>).errorCodes)
    || ((validation as Record<string, unknown>).errorCodes as unknown[]).length > 32
    || !((validation as Record<string, unknown>).errorCodes as unknown[]).every((item) => typeof item === 'string' && item.length > 0 && item.length <= 160)
    || typeof (validation as Record<string, unknown>).errorsTruncated !== 'boolean')) {
    throw new Error('candidate_financial_local_parser_invalid_validation');
  }
  if (result.parser === 'arelle' && (!Array.isArray(validatedFacts) || validatedFacts.length > 200
    || !validatedFacts.every((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const fact = item as Record<string, unknown>;
      return typeof fact.xbrl_context === 'string' && fact.xbrl_context.length > 0 && fact.xbrl_context.length <= 256
        && typeof fact.xbrl_concept === 'string' && fact.xbrl_concept.length > 0 && fact.xbrl_concept.length <= 256
        && typeof fact.value === 'string' && /^-?\d+(?:[.]\d+)?$/u.test(fact.value) && Number.isFinite(Number(fact.value))
        && ['TWD', 'TWD_per_share', 'share'].includes(String(fact.unit));
    }))) throw new Error('candidate_financial_local_parser_invalid_fact_manifest');
  return {
    schema: 'candidate-financial-document-parser-v1', status: result.status as 'complete' | 'partial',
    parser: result.parser as 'arelle' | 'pdfplumber' | 'docling', inputSha256,
    locators: result.locators as CandidateFinancialDocumentLocator[], missingRequirements: result.missingRequirements as string[],
    validation: validation as CandidateFinancialLocalParserResult['validation'],
    validatedFacts: validatedFacts as CandidateFinancialLocalParserResult['validatedFacts'],
  };
}

async function runIsolatedSocketParser(input: { bytes: Uint8Array; documentSha256: string; format: CandidateFinancialDocumentFormat }) {
  return await new Promise<CandidateFinancialLocalParserResult>((resolveResult, reject) => {
    const socket = net.createConnection({ path: PARSER_SOCKET_PATH });
    let output = ''; let settled = false;
    const finish = (error?: Error, result?: CandidateFinancialLocalParserResult) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); socket.destroy();
      if (error) reject(error); else resolveResult(result!);
    };
    const timeout = setTimeout(() => finish(new Error('candidate_financial_local_parser_timeout')), PARSER_TIMEOUT_MS);
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ format: input.format, sha256: input.documentSha256, byteLength: input.bytes.byteLength })}\n`);
      socket.write(input.bytes); socket.end();
    });
    socket.on('data', (chunk: string) => {
      output += chunk;
      if (Buffer.byteLength(output, 'utf8') > MAX_PARSER_STDOUT_BYTES) finish(new Error('candidate_financial_local_parser_output_too_large'));
    });
    socket.on('error', () => finish(new Error('candidate_financial_local_parser_socket_unavailable')));
    socket.on('end', () => {
      try {
        const serviceError = JSON.parse(output) as { error?: unknown };
        if (serviceError?.error) { finish(new Error('candidate_financial_local_parser_failed')); return; }
      } catch { /* normal parser response is validated below */ }
      try { finish(undefined, parseResult(output.trim(), input.documentSha256)); }
      catch (error) { finish(error instanceof Error ? error : new Error('candidate_financial_local_parser_invalid_result')); }
    });
  });
}

/**
 * Executes only a reviewed, absolute-path Python runtime without a shell. The
 * parser receives document bytes over stdin, never a URL or a filesystem path.
 * A host must opt in with the reviewed virtualenv location; Vercel does not
 * meet this condition and therefore fails closed before spawning a process.
 */
export async function runCandidateFinancialLocalParser(input: {
  bytes: Uint8Array;
  documentSha256: string;
  format: CandidateFinancialDocumentFormat;
  spawn?: Spawn;
  pythonPath?: string;
  parserScriptPath?: string;
  allowDocling?: boolean;
}): Promise<CandidateFinancialLocalParserResult> {
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES
    || !/^[0-9a-f]{64}$/u.test(input.documentSha256)
    || createHash('sha256').update(input.bytes).digest('hex') !== input.documentSha256) throw new Error('candidate_financial_local_parser_input_invalid');
  // Production uses only the credential-free systemd socket service. Direct
  // process execution is retained solely as an injected test seam.
  if (!input.spawn) {
    if (input.pythonPath || input.parserScriptPath) throw new Error('candidate_financial_local_parser_not_configured');
    return runIsolatedSocketParser(input);
  }
  const pythonPath = input.pythonPath ?? '';
  const script = input.parserScriptPath ?? '';
  // Paths are supplied only by the protected VPS service configuration. Their
  // existence is intentionally resolved by spawn below so Next does not trace
  // arbitrary host paths into its server bundle; a missing executable/script
  // still fails closed as a parser spawn/result failure.
  if (!APPROVED_PYTHON_PATH.test(pythonPath) || !APPROVED_PYTHON_PATH.test(script)) throw new Error('candidate_financial_local_parser_not_configured');
  const spawn = input.spawn;
  const args = [script, '--format', input.format, '--sha256', input.documentSha256, '--max-bytes', String(MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES)];
  const doclingModelsPath = process.env.STOCKINSIDER_DOCUMENT_PARSER_DOCLING_MODELS ?? '';
  if (input.allowDocling === true && process.env.STOCKINSIDER_DOCUMENT_PARSER_ALLOW_DOCLING === 'true'
    && APPROVED_PYTHON_PATH.test(doclingModelsPath)) {
    args.push('--allow-docling', '--docling-models-path', doclingModelsPath);
  }
  return await new Promise<CandidateFinancialLocalParserResult>((resolveResult, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(pythonPath, args, {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        // Keep the child deterministic and unable to consult proxy settings.
        env: { NODE_ENV: process.env.NODE_ENV || 'production', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', PYTHONNOUSERSITE: '1', PYTHONHASHSEED: '0', NO_PROXY: '*', no_proxy: '*', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
      });
    } catch { reject(new Error('candidate_financial_local_parser_spawn_failed')); return; }
    let stdout = ''; let stderr = ''; let settled = false;
    const finish = (error?: Error, result?: CandidateFinancialLocalParserResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error); else resolveResult(result!);
    };
    const timeout = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('candidate_financial_local_parser_timeout')); }, PARSER_TIMEOUT_MS);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_PARSER_STDOUT_BYTES) { child.kill('SIGKILL'); finish(new Error('candidate_financial_local_parser_output_too_large')); }
    });
    child.stderr.on('data', (chunk: string) => { if (Buffer.byteLength(stderr += chunk, 'utf8') > MAX_PARSER_STDERR_BYTES) child.kill('SIGKILL'); });
    child.on('error', () => finish(new Error('candidate_financial_local_parser_spawn_failed')));
    child.on('close', (code) => {
      if (code !== 0) return finish(new Error(`candidate_financial_local_parser_failed:${String(code)}`));
      try { finish(undefined, parseResult(stdout, input.documentSha256)); } catch (error) { finish(error instanceof Error ? error : new Error('candidate_financial_local_parser_invalid_result')); }
    });
    child.stdin.on('error', () => finish(new Error('candidate_financial_local_parser_stdin_failed')));
    child.stdin.end(input.bytes);
  });
}
