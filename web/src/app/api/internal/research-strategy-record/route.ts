import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { researchCanonicalHash } from '@/lib/research-agent-qualification';
import { assessStrategyExperiment, issueStrategyApproval, validateStrategyExperimentProposal,
  type StrategyExperimentProposal, type StrategyExperimentObservation,
  type StrategyExperimentAssessment } from '@/lib/research-strategy-governance';
import { PAPER_RISK_POLICY_HASH } from '@/lib/research-paper-books';

type Row = Record<string, unknown>;
type Validation = Parameters<typeof issueStrategyApproval>[0]['independentValidation'] & {
  executionReceiptHash: string; datasetManifestHash: string; testReportHash: string;
};
const hash = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
const stamp = (value: unknown) => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now();

/** Persistence is separate from model inference. No author or cron may adopt a strategy. */
export async function POST(request: Request) {
  const auth = requireInternalAuth(request, { allowResearchReviewer: true, allowResearchTester: true, allowStrategyApprover: true });
  if (!auth.ok || !request.headers.get('authorization')?.startsWith('Bearer ') || request.headers.has('x-internal-key'))
    return NextResponse.json({ ok: false, error: 'exact_research_role_bearer_required' }, { status: 401 });
  const body = await request.json().catch(() => null) as Row | null;
  const kind = String(body?.kind || '');
  const required = ({ proposal: 'internal_api_key', assessment: 'research_review_key',
    validation: 'research_test_key', approval: 'strategy_approval_key' } as Record<string, string>)[kind];
  if (!body || required !== auth.authSource)
    return NextResponse.json({ ok: false, error: 'research_strategy_role_not_authorized' }, { status: 403 });
  const db = getSupabaseServerClient();
  try {
    const inputHash = researchCanonicalHash(body);
    // Lost-response/restart retries preserve the accepted result even after its
    // effective time. Fresh backdated approvals still fail temporal admission.
    const existing = await db.from('research_strategy_records_v1').select('record_hash,kind,payload,input_payload')
      .eq('input_hash', inputHash).eq('kind', kind).limit(2);
    if (existing.error || !Array.isArray(existing.data) || existing.data.length > 1)
      throw new Error(existing.error?.message || 'research_strategy_replay_conflict');
    if (existing.data.length) {
      if (researchCanonicalHash(existing.data[0].input_payload) !== inputHash)
        throw new Error('research_strategy_replay_mismatch');
      return NextResponse.json({ ok: true, kind, recordHash: existing.data[0].record_hash,
        payload: existing.data[0].payload, idempotentReplay: true });
    }
    let payload: Row; let proposalHash: string; let parentHash: string | null = null;
    let recordHash: string;
    const read = async (key: string, expectedKind: string) => {
      if (!hash(key)) throw new Error('research_strategy_record_hash_invalid');
      const result = await db.from('research_strategy_records_v1').select('kind,payload,proposal_hash,parent_hash,available_at')
        .eq('record_hash', key).maybeSingle();
      if (result.error || !result.data || result.data.kind !== expectedKind)
        throw new Error(result.error?.message || 'research_strategy_parent_missing');
      return result.data;
    };
    if (kind === 'proposal') {
      const proposal = body.proposal as StrategyExperimentProposal;
      recordHash = validateStrategyExperimentProposal(proposal);
      if (!stamp(proposal.registeredAt)) throw new Error('research_strategy_future_registration');
      proposalHash = recordHash; payload = proposal as unknown as Row;
    } else {
      proposalHash = String(body.proposalHash || '');
      const proposalRow = await read(proposalHash, 'proposal');
      const proposal = proposalRow.payload as StrategyExperimentProposal;
      if (kind === 'assessment') {
        const observations = body.observations as StrategyExperimentObservation[];
        if (!Array.isArray(observations) || observations.length > 100_000 || !stamp(body.evaluatedAt))
          throw new Error('research_strategy_observation_bound_invalid');
        const assessment = assessStrategyExperiment({ proposal, observations,
          independentReviewerId: String(body.reviewerId || ''), evaluatedAt: String(body.evaluatedAt) });
        payload = assessment as unknown as Row; recordHash = researchCanonicalHash(payload); parentHash = proposalHash;
      } else {
        const assessmentHash = String(body.assessmentHash || '');
        const assessmentRow = await read(assessmentHash, 'assessment');
        if (assessmentRow.proposal_hash !== proposalHash) throw new Error('research_strategy_assessment_binding_invalid');
        const assessment = assessmentRow.payload as StrategyExperimentAssessment;
        if (kind === 'validation') {
          const validation = body.validation as Validation;
          const { receiptHash, ...material } = validation;
          if (receiptHash !== researchCanonicalHash(material) || validation.proposalHash !== proposalHash
            || validation.assessmentHash !== assessmentHash || validation.codeHash !== proposal.codeHash
            || researchCanonicalHash(validation.parameterHashes) !== researchCanonicalHash(proposal.variants.map((variant) => variant.parameterHash))
            || validation.riskPolicyHash !== PAPER_RISK_POLICY_HASH || !stamp(validation.validatedAt)
            || Date.parse(validation.validatedAt) < Date.parse(assessment.evaluatedAt)
            || [proposal.authorId, assessment.reviewerId].includes(validation.reviewerId) || !validation.reviewerId
            || !['passed', 'failed'].includes(validation.status)
            || typeof validation.holdoutAndForwardChecked !== 'boolean'
            || ![validation.executionReceiptHash, validation.datasetManifestHash, validation.testReportHash].every(hash))
            throw new Error('research_strategy_independent_validation_binding_invalid');
          payload = validation as unknown as Row; recordHash = receiptHash; parentHash = assessmentHash;
        } else {
          const validationHash = String(body.validationHash || '');
          const validationRow = await read(validationHash, 'validation');
          if (validationRow.proposal_hash !== proposalHash || validationRow.parent_hash !== assessmentHash
            || !stamp(body.approvedAt) || Date.parse(String(body.effectiveFrom)) < Date.now())
            throw new Error('research_strategy_approval_binding_or_effective_time_invalid');
          // The human controller owns STRATEGY_APPROVAL_KEY. General deployment
          // permission cannot create this exact financial strategy approval.
          const approval = issueStrategyApproval({ proposal, assessment, independentReviewerId: assessment.reviewerId,
            independentValidation: validationRow.payload as Validation, approvedBy: String(body.approvedBy || ''),
            approvedAt: String(body.approvedAt), effectiveFrom: String(body.effectiveFrom), riskPolicyHash: PAPER_RISK_POLICY_HASH });
          payload = approval as unknown as Row; recordHash = approval.receiptHash; parentHash = validationHash;
        }
      }
    }
    const saved = await db.from('research_strategy_records_v1').insert({ record_hash: recordHash, kind,
      proposal_hash: proposalHash, parent_hash: parentHash, payload, input_hash: inputHash, input_payload: body }).select('record_hash').single();
    if (saved.error && saved.error.code !== '23505') throw new Error(saved.error.message);
    if (saved.error) {
      const replay = await db.from('research_strategy_records_v1').select('payload,input_hash').eq('record_hash', recordHash).maybeSingle();
      if (replay.error || !replay.data || replay.data.input_hash !== inputHash
        || researchCanonicalHash(replay.data.payload) !== researchCanonicalHash(payload)) throw new Error('research_strategy_replay_mismatch');
    }
    return NextResponse.json({ ok: true, kind, recordHash, payload, idempotentReplay: Boolean(saved.error) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'research_strategy_record_failed' }, { status: 409 });
  }
}
