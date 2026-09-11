import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const fixtureUrl = new URL('./fixtures/candidate-financial-document-parser/partial-scope-contract.json', import.meta.url);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function seal(report) {
  report.errorManifestSha256 = createHash('sha256').update(JSON.stringify(canonical(report.factAcceptance))).digest('hex');
  return report;
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;

// All data is synthetic contract evidence inside a fresh, private local cluster.
// This proves the database boundary, not that a real issuer filing was validated.
test('v10 admits only isolated facts and never upgrades a partial document or its acquisition job', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-partial-v10-pg-'));
  const data = path.join(temporary, 'data'), socket = path.join(temporary, 'socket');
  fs.mkdirSync(socket);
  const user = os.userInfo().username, port = 55000 + process.pid % 2500;
  const binary = (name) => process.env.OPPORTUNITY_V3_POSTGRES_BIN ? path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN, name) : name;
  const command = (name, args, input) => spawnSync(binary(name), args, { input, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  const checked = (name, args, input) => {
    const result = command(name, args, input);
    assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout.trim();
  };
  const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port), '-U', user, '-d', 'postgres', '-At'];
  const sql = (input) => checked('psql', args, input);
  const stock = randomUUID(), principal = '55555555-5555-4555-8555-555555555555';
  let started = false;
  try {
    checked('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', user]);
    checked('pg_ctl', ['-D', data, '-l', path.join(temporary, 'postgres.log'),
      '-o', `-F -k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    sql(fs.readFileSync(new URL('./fixtures/candidate-financial-document-parser/partial-admission-postgres.sql', import.meta.url), 'utf8'));
    for (const filename of ['20260911_candidate_financial_fact_manifest_v8.sql', '20260911_03_financial_document_job_links.sql']) {
      sql(fs.readFileSync(new URL(`../migrations/${filename}`, import.meta.url), 'utf8'));
    }
    const migration = fs.readFileSync(new URL('../migrations/20260911_05_financial_fact_isolation_v10.sql', import.meta.url), 'utf8');
    sql(migration); sql(migration);
    sql(`INSERT INTO stocks VALUES('${stock}','2330')`);
    const makeCase = (label) => {
      const receipt = randomUUID(), job = randomUUID(), document = randomUUID();
      const report = JSON.parse(fs.readFileSync(fixtureUrl, 'utf8'));
      const hash = createHash('sha256').update(`synthetic-v10-contract:${label}`).digest('hex');
      report.inputSha256 = hash; report.factAcceptance.documentSha256 = hash; seal(report);
      sql(`INSERT INTO candidate_financial_acquisition_jobs_v4(job_id,stock_id,status,lease_owner,lease_expires_at)
        VALUES('${job}','${stock}','running','runner',clock_timestamp()+interval '5 minutes');
        INSERT INTO candidate_issuer_ir_document_queue_v4 VALUES('${document}');
        INSERT INTO candidate_financial_document_receipts_v6(receipt_id,stock_id,acquisition_job_id,issuer_document_id,
          source_url,exchange,period_end,document_sha256,receipt_status,parser_status,parser_owner,parser_lease_expires_at)
        VALUES('${receipt}','${stock}','${job}','${document}','https://mopsov.twse.com.tw/server-java/FileDownLoad',
          'TWSE','2026-06-30','${hash}','accepted','running','runner',clock_timestamp()+interval '5 minutes');`);
      const fact = { input: { stock_id: stock, fact_key: 'quarterly_revenue', period_start: '2026-04-01', period_end: '2026-06-30',
        duration_kind: 'quarterly', value: 100, unit: 'TWD', provider: 'mops', authority_tier: 'official_filing',
        estimate_kind: 'reported', estimate_horizon: 'reported_period', filing_published_at: '2026-08-10T00:00:00Z',
        source_timestamp: '2026-08-10T00:00:00Z', collected_at: '2026-08-10T01:00:00Z', filing_restatement_id: null,
        source_ref: `issuer-document:${hash}:acceptance-revenue` },
      locator: { xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue', structural_fact_key: 'c'.repeat(64),
        concept_namespace: 'urn:stockinsider:acceptance:tifrs-full' } };
      return { receipt, job, hash, report, fact };
    };
    const evidence = (subject) => ({ schema: 'candidate-financial-parser-evidence-v10',
      documentSha256: subject.hash, documentStatus: subject.report.status, parser: 'arelle', parserVersion: '2.44.7',
      taxonomySha256: subject.report.taxonomySha256, validation: subject.report.validation,
      validatedFacts: subject.report.validatedFacts, factAcceptance: subject.report.factAcceptance,
      errorManifestSha256: subject.report.errorManifestSha256 });
    const completion = (subject, parserEvidence = evidence(subject), rpc = 'complete_candidate_financial_document_receipt_parser_v10', facts = [subject.fact]) =>
      `SET ROLE service_role; SELECT * FROM ${rpc}('${subject.receipt}','runner','${principal}',
        ${json(facts)},${json(subject.report.locators)},${json(parserEvidence)},
        ${json(subject.report.missingRequirements)},'[]',clock_timestamp())`;
    const validate = (subject) => {
      const validation = { version: 'official-financial-v2', schemaValid: true, unitValid: true,
        pointInTimeValid: true, consistencyValid: true, reasons: [], checks: ['fixture-accounting-receipt'] };
      return sql(`SET ROLE service_role; SELECT record_official_financial_validation(
        (SELECT fact_id FROM candidate_financial_document_fact_links_v8 WHERE receipt_id='${subject.receipt}'),
        (SELECT fact_recorded_at FROM candidate_financial_document_fact_links_v8 WHERE receipt_id='${subject.receipt}'),
        '${subject.hash}','${'f'.repeat(64)}',${json(validation)},'${principal}')`);
    };
    const finalize = (subject) => sql(`SET ROLE service_role; SELECT * FROM finalize_candidate_financial_document_validation_v8(
      '${subject.receipt}','${principal}',clock_timestamp())`);

    const partial = makeCase('safe-unrelated-error');
    assert.match(sql(completion(partial)), /^validation_pending\|1\|0$/u);
    assert.equal(sql(`SELECT validation_status FROM opportunity_financial_facts_v3 WHERE source_ref=${quote(partial.fact.input.source_ref)}`), 'pending');
    assert.match(finalize(partial), /^pending\|0\|0\|1$/u, 'structural proof alone cannot complete accounting validation');
    const saved = JSON.parse(sql(`SELECT jsonb_build_object('status',document_status,'proof',fact_acceptance,
      'errorHash',error_manifest_sha256,'summary',validation_summary,'facts',validated_fact_manifest)
      FROM candidate_financial_parser_evidence_v8 WHERE receipt_id='${partial.receipt}'`));
    assert.equal(saved.status, 'partial');
    assert.deepEqual(saved.proof, partial.report.factAcceptance);
    assert.equal(saved.errorHash, partial.report.errorManifestSha256);
    assert.equal(saved.summary.errorCount, 1);
    assert.deepEqual(saved.facts, partial.report.validatedFacts);
    const partialFactId = sql(`SELECT fact_id FROM candidate_financial_document_fact_links_v8
      WHERE receipt_id='${partial.receipt}'`);
    const legacyValidation = { version: 'official-financial-v1', schemaValid: true, unitValid: true,
      pointInTimeValid: true, consistencyValid: true, reasons: [], checks: ['unbound-predecessor'] };
    sql(`INSERT INTO official_financial_validation_receipts(
        fact_id,validator_version,input_hash,source_sha256,validation,prior_validation,effective_validation
      ) VALUES('${partialFactId}','official-financial-v1','${'1'.repeat(64)}','${partial.hash}',${json(legacyValidation)},
        '{"validation_status":"pending"}',
        '{"validation_status":"validated","schema_valid":true,"unit_valid":true,"point_in_time_valid":true,"consistency_valid":true}');
      UPDATE opportunity_financial_facts_v3 SET validation_status='validated',schema_valid=true,
        unit_valid=true,point_in_time_valid=true,consistency_valid=true WHERE fact_id='${partialFactId}'`);
    assert.match(finalize(partial), /^pending\|0\|0\|1$/u,
      'an unbound V1 receipt and mutable fact flags cannot complete a document');
    assert.match(sql(`SET ROLE service_role; SELECT job_status FROM reconcile_candidate_financial_document_job_v9(
      '${partial.receipt}','${partial.job}','${principal}')`), /^queued$/u,
    'job completion must also ignore unbound predecessor authority');
    assert.equal(validate(partial), 't');
    assert.match(finalize(partial), /^validated\|1\|0\|0$/u);
    assert.equal(sql(`SELECT receipt_status||'|'||financial_validation_status FROM candidate_financial_document_receipts_v6
      WHERE receipt_id='${partial.receipt}'`), 'partial|validated');
    assert.equal(sql(`SELECT EXISTS(SELECT 1 FROM candidate_financial_acquisition_jobs_v4 WHERE job_id='${partial.job}'
      AND status='terminal' AND terminal_reason='complete')`), 'f');
    // The append-only proof, not mutable receipt flags, governs full-document readiness.
    sql(`UPDATE candidate_financial_document_receipts_v6 SET receipt_status='accepted',missing_requirements='[]',rejection_reasons='[]'
      WHERE receipt_id='${partial.receipt}'`);
    assert.match(sql(`SET ROLE service_role; SELECT job_status FROM reconcile_candidate_financial_document_job_v9(
      '${partial.receipt}','${partial.job}','${principal}')`), /^queued$/u);

    const rejectionCases = [
      ['tainted-fact', (subject) => { subject.report.factAcceptance.rejections[0].factKey = 'c'.repeat(64); }],
      ['unscoped-error', (subject) => { subject.report.factAcceptance.errors[0].refs = []; }],
      ['unresolved-ref', (subject) => { delete subject.report.factAcceptance.errors[0].refs[0].objectId; }],
      ['unknown-code', (subject) => { subject.report.factAcceptance.errors[0].code = 'unknown:validationFailure'; subject.report.validation.errorCodes = ['unknown:validationFailure']; }],
      ['fatal-document', (subject) => { subject.report.factAcceptance.documentFatal = true; subject.report.factAcceptance.errors[0].fatal = true; }],
      ['incomplete-manifest', (subject) => { subject.report.factAcceptance.manifestComplete = false; }],
      ['source-validation-incomplete', (subject) => { subject.report.factAcceptance.sourceValidationCompleted = false; }],
      ['extraction-validation-incomplete', (subject) => { subject.report.factAcceptance.extractedValidationCompleted = false; }],
      ['inline-pretends-raw', (subject) => { subject.report.factAcceptance.extractedInstanceSha256 = null;
        subject.report.factAcceptance.extractedValidationCompleted = false;
        subject.report.validatedFacts[0].extractedFactId = subject.report.validatedFacts[0].sourceFactId; }],
      ['pdf-cannot-claim-arelle-facts', (subject) => {
        sql(`UPDATE candidate_financial_document_receipts_v6 SET content_type='application/pdf' WHERE receipt_id='${subject.receipt}'`);
      }],
      ['truncated-errors', (subject) => { subject.report.validation.errorsTruncated = true; }],
      ['suppressed-error-count', (subject) => { subject.report.validation.errorCount = 0; subject.report.validation.errorCodes = []; }],
      ['pretend-document-complete', (subject) => { subject.report.status = 'complete'; subject.report.missingRequirements = []; }],
      ['dimension-equity', (subject) => {
        Object.assign(subject.report.validatedFacts[0], { dimension_count: 1, xbrl_concept: 'tifrs-full:Equity',
          period_start: null, duration_kind: 'instant' });
        subject.report.locators[0].xbrl_concept = subject.fact.locator.xbrl_concept = 'tifrs-full:Equity';
        Object.assign(subject.fact.input, { fact_key: 'total_equity', period_start: null, duration_kind: 'instant' });
      }],
      ['dimension-profit', (subject) => {
        Object.assign(subject.report.validatedFacts[0], { dimension_count: 1, xbrl_concept: 'tifrs-full:ProfitLoss' });
        subject.report.locators[0].xbrl_concept = subject.fact.locator.xbrl_concept = 'tifrs-full:ProfitLoss';
        subject.fact.input.fact_key = 'quarterly_net_income';
      }],
      ['wrong-structural-key', (subject) => { subject.fact.locator.structural_fact_key = 'd'.repeat(64); }],
      ['wrong-namespace', (subject) => { subject.fact.locator.concept_namespace = 'urn:different'; }],
      ['wrong-value', (subject) => { subject.fact.input.value = 101; }],
      ['wrong-context', (subject) => { subject.fact.locator.xbrl_context = 'another-context'; }],
      ['wrong-entity', (subject) => { subject.report.validatedFacts[0].entity_identifier = '9999'; }],
      ['wrong-period', (subject) => { subject.report.validatedFacts[0].period_end = '2025-06-30'; }],
      ['wrong-unit', (subject) => { subject.report.validatedFacts[0].unit = 'share'; }],
    ];
    for (const [name, mutate] of rejectionCases) {
      const subject = makeCase(name); mutate(subject); seal(subject.report);
      const attempted = command('psql', args, completion(subject));
      assert.notEqual(attempted.status, 0, `${name}: an invalid selected fact/proof must be rejected`);
      assert.equal(sql(`SELECT count(*) FROM candidate_financial_document_fact_links_v8 WHERE receipt_id='${subject.receipt}'`), '0', name);
      assert.equal(sql(`SELECT count(*) FROM opportunity_financial_facts_v3 WHERE source_ref=${quote(subject.fact.input.source_ref)}`), '0', name);
    }
    const tampered = makeCase('hash-tampering'); tampered.report.errorManifestSha256 = '0'.repeat(64);
    assert.notEqual(command('psql', args, completion(tampered)).status, 0);
    const downgraded = makeCase('legacy-v8-error-bypass');
    const legacyEvidence = { ...evidence(downgraded), schema: 'candidate-financial-parser-evidence-v8' };
    assert.notEqual(command('psql', args, completion(downgraded, legacyEvidence, 'complete_candidate_financial_document_receipt_parser_v8')).status, 0);

    const raw = makeCase('raw-xbrl-extraction-not-applicable');
    sql(`UPDATE candidate_financial_document_receipts_v6 SET content_type='application/xml' WHERE receipt_id='${raw.receipt}'`);
    raw.report.factAcceptance.extractedInstanceSha256 = null;
    raw.report.factAcceptance.extractedValidationCompleted = false;
    raw.report.validatedFacts[0].extractedFactId = raw.report.validatedFacts[0].sourceFactId; seal(raw.report);
    assert.match(sql(completion(raw)), /^validation_pending\|1\|0$/u);
    assert.equal(validate(raw), 't'); assert.match(finalize(raw), /^validated\|1\|0\|0$/u);
    assert.equal(sql(`SELECT receipt_status FROM candidate_financial_document_receipts_v6 WHERE receipt_id='${raw.receipt}'`), 'partial');

    const diagnostic = makeCase('bounded-error-overflow-diagnostic-only');
    diagnostic.report.validatedFacts = [];
    diagnostic.report.validation.validFactCount = 0;
    diagnostic.report.validation.errorCount = 20000;
    diagnostic.report.validation.errorsTruncated = true;
    diagnostic.report.factAcceptance.manifestComplete = false;
    diagnostic.report.missingRequirements.push('arelle_error_manifest_overflow'); seal(diagnostic.report);
    assert.match(sql(completion(diagnostic, evidence(diagnostic), undefined, [])), /^partial\|0\|0$/u);
    const diagnosticSaved = JSON.parse(sql(`SELECT jsonb_build_object('status',document_status,'proof',fact_acceptance,
      'errorHash',error_manifest_sha256,'summary',validation_summary)
      FROM candidate_financial_parser_evidence_v8 WHERE receipt_id='${diagnostic.receipt}'`));
    assert.equal(diagnosticSaved.status, 'partial');
    assert.equal(diagnosticSaved.summary.errorCount, 20000);
    assert.equal(diagnosticSaved.summary.errorsTruncated, true);
    assert.deepEqual(diagnosticSaved.proof, diagnostic.report.factAcceptance);
    assert.equal(diagnosticSaved.errorHash, diagnostic.report.errorManifestSha256);
    assert.equal(sql(`SELECT count(*) FROM candidate_financial_document_fact_links_v8 WHERE receipt_id='${diagnostic.receipt}'`), '0');
    assert.equal(sql(`SELECT EXISTS(SELECT 1 FROM candidate_financial_acquisition_jobs_v4 WHERE job_id='${diagnostic.job}'
      AND status='terminal' AND terminal_reason='complete')`), 'f');

    const complete = makeCase('clean-v2-document');
    complete.report.status = 'complete'; complete.report.missingRequirements = [];
    complete.report.validation.errorCount = 0; complete.report.validation.errorCodes = [];
    complete.report.factAcceptance.errors = []; complete.report.factAcceptance.rejections = []; seal(complete.report);
    assert.match(sql(completion(complete)), /^validation_pending\|1\|0$/u);
    assert.equal(validate(complete), 't'); assert.match(finalize(complete), /^validated\|1\|0\|0$/u);
    assert.equal(sql(`SELECT receipt_status FROM candidate_financial_document_receipts_v6 WHERE receipt_id='${complete.receipt}'`), 'accepted');
    assert.equal(sql(`SELECT status||'|'||terminal_reason FROM candidate_financial_acquisition_jobs_v4 WHERE job_id='${complete.job}'`), 'terminal|complete');

    // The reader is a second authority boundary: historical accounting flags do
    // not prove structural validity, and later evidence cannot enter an old run.
    const legacy = makeCase('clean-v8-reader-compatibility');
    legacy.report.validation.errorCount = 0; legacy.report.validation.errorCodes = [];
    legacy.report.missingRequirements = [];
    const cleanLegacyEvidence = { schema: 'candidate-financial-parser-evidence-v8', documentSha256: legacy.hash,
      parser: 'arelle', parserVersion: '2.44.7', taxonomySha256: legacy.report.taxonomySha256,
      validation: legacy.report.validation, validatedFacts: legacy.report.validatedFacts };
    assert.match(sql(completion(legacy, cleanLegacyEvidence, 'complete_candidate_financial_document_receipt_parser_v8')), /^validation_pending\|1\|0$/u);
    assert.equal(validate(legacy), 't'); assert.match(finalize(legacy), /^validated\|1\|0\|0$/u);
    const cutoff = new Date(Date.now() + 300000).toISOString();
    const later = new Date(Date.now() + 600000).toISOString();
    const after = new Date(Date.now() + 900000).toISOString();
    const reader = (factId, at) => `SELECT COALESCE((SELECT validation_status::text FROM public.read_financial_facts_as_of(${quote(at)})
      WHERE fact_id='${factId}'),'absent')`;
    for (const subject of [legacy, partial]) {
      const rows = JSON.parse(sql(`SELECT jsonb_build_object('fact',to_jsonb(f),'receipt',to_jsonb(r),
        'evidence',to_jsonb(e),'link',to_jsonb(l),'provenance',to_jsonb(p),'validation',to_jsonb(v))
        FROM candidate_financial_document_fact_links_v8 l
        JOIN opportunity_financial_facts_v3 f ON f.fact_id=l.fact_id
        JOIN candidate_financial_document_receipts_v6 r ON r.receipt_id=l.receipt_id
        JOIN candidate_financial_parser_evidence_v8 e ON e.evidence_id=l.evidence_id
        JOIN candidate_financial_fact_provenance_v4 p ON p.fact_id=f.fact_id
        JOIN official_financial_validation_receipts v ON v.fact_id=f.fact_id
        WHERE l.receipt_id='${subject.receipt}' AND v.validator_version='official-financial-v2'
          AND v.validator_principal IS NOT NULL`));
      assert.equal(sql(`SET ROLE service_role; ${reader(rows.fact.fact_id, cutoff)}`), 'validated');
      const tables = { fact: 'opportunity_financial_facts_v3', receipt: 'candidate_financial_document_receipts_v6',
        evidence: 'candidate_financial_parser_evidence_v8', link: 'candidate_financial_document_fact_links_v8',
        provenance: 'candidate_financial_fact_provenance_v4' };
      const vectors = [
        ['fact', 'filing_published_at'], ['fact', 'source_timestamp'], ['fact', 'collected_at'], ['fact', 'recorded_at'],
        ['evidence', 'recorded_at'], ['link', 'created_at'], ['provenance', 'extracted_at'], ['provenance', 'recorded_at'],
        ['receipt', 'accepted_at'], ['receipt', 'completed_at'], ['receipt', 'published_at'], ['validation', 'validated_at'],
      ];
      for (const [table, field] of vectors) {
        // Clone valid synthetic records by INSERT, keeping immutable proof
        // triggers enabled. Change one availability timestamp, never its proof.
        const clone = structuredClone(rows), factId = randomUUID(), receiptId = randomUUID(), evidenceId = randomUUID();
        clone.fact.fact_id = factId; clone.receipt.receipt_id = receiptId; clone.receipt.parser_evidence_id = null;
        clone.evidence.evidence_id = evidenceId; clone.evidence.receipt_id = receiptId;
        clone.link.fact_id = factId; clone.link.receipt_id = receiptId; clone.link.evidence_id = evidenceId;
        clone.provenance.fact_id = factId; clone.provenance.locator.parser_evidence_id = evidenceId;
        clone.validation.fact_id = factId; clone.validation.id = randomUUID();
        clone[table][field] = later;
        clone.link.fact_recorded_at = clone.fact.recorded_at;
        const insert = (key) => `INSERT INTO ${tables[key]} SELECT (jsonb_populate_record(NULL::${tables[key]},${json(clone[key])})).*;`;
        const receiptColumns = Object.keys(clone.validation).filter((key) => key !== 'receipt_sequence');
        const seed = ['BEGIN;', insert('fact'), insert('receipt'), insert('evidence'), insert('provenance'), insert('link'),
          `UPDATE candidate_financial_document_receipts_v6 SET parser_evidence_id='${evidenceId}' WHERE receipt_id='${receiptId}';`,
          `INSERT INTO official_financial_validation_receipts(${receiptColumns.join(',')})
            SELECT ${receiptColumns.join(',')} FROM jsonb_populate_record(NULL::official_financial_validation_receipts,${json(clone.validation)});`].join('\n');
        const result = sql(`${seed} SET ROLE service_role; ${reader(factId, cutoff)}; ${reader(factId, after)}; ROLLBACK;`).split('\n');
        assert.deepEqual(result, [table === 'validation' ? 'pending' : 'absent', 'validated'],
          `${subject === legacy ? 'v8' : 'v10 partial'} ${table}.${field} must obey exact evaluation cutoff`);
      }
      const oldUnproven = { ...rows.fact, fact_id: randomUUID() };
      assert.equal(sql(`BEGIN; INSERT INTO opportunity_financial_facts_v3
        SELECT (jsonb_populate_record(NULL::opportunity_financial_facts_v3,${json(oldUnproven)})).*;
        SET ROLE service_role; ${reader(oldUnproven.fact_id, after)}; ROLLBACK;`), 'absent',
      'previously validated issuer-document flags cannot grandfather a row with no structural proof');
    }
    const proofSignature = 'candidate_financial_fact_has_structural_proof_as_of_v10(uuid,timestamptz,text,timestamptz)';
    for (const role of ['anon', 'authenticated']) assert.equal(sql(`SELECT has_function_privilege('${role}','${proofSignature}','EXECUTE')`), 'f');
    assert.equal(sql(`SELECT has_function_privilege('service_role','${proofSignature}','EXECUTE')`), 't');
    assert.equal(sql(`SELECT prosecdef FROM pg_proc WHERE oid='read_financial_facts_as_of(timestamptz)'::regprocedure`), 'f');

    const signature = 'complete_candidate_financial_document_receipt_parser_v10(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz)';
    for (const role of ['anon', 'authenticated']) assert.equal(sql(`SELECT has_function_privilege('${role}','${signature}','EXECUTE')`), 'f');
    assert.equal(sql(`SELECT has_function_privilege('service_role','${signature}','EXECUTE')`), 't');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(sql(`SELECT has_table_privilege('${role}','candidate_financial_parser_evidence_v8','INSERT,UPDATE,DELETE')`), 'f');
    }
    assert.equal(sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='record_official_financial_validation'"), '1');
    assert.equal(sql("SELECT pg_get_userbyid(proowner)||'|'||position('search_path=\"\"' IN array_to_string(proconfig,',')) FROM pg_proc WHERE oid='record_official_financial_validation(uuid,timestamptz,text,text,jsonb,uuid)'::regprocedure"), 'opportunity_v3_rpc_owner|1');
    assert.equal(sql("SELECT has_function_privilege('service_role','record_official_financial_validation(uuid,timestamptz,text,text,jsonb,uuid)','EXECUTE')"), 't');
    const changedProof = command('psql', args, `UPDATE candidate_financial_parser_evidence_v8 SET fact_acceptance='{}'
      WHERE receipt_id='${partial.receipt}'`);
    assert.notEqual(changedProof.status, 0, 'even table owner cannot rewrite the retained parser/error proof');
    assert.equal(JSON.parse(sql(`SELECT fact_acceptance FROM candidate_financial_parser_evidence_v8 WHERE receipt_id='${partial.receipt}'`)).errors.length, 1);
  } finally {
    if (started) checked('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
