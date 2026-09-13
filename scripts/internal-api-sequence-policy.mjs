/** Long candidate-research calls are deliberate on the VPS. Keep each step and
 * the whole sequence bounded below the systemd unit's 140-minute deadline. */
export function parseInternalApiSequence(raw) {
  let steps;
  try { steps = JSON.parse(raw || '[]'); } catch { throw new Error('sequence must be valid JSON'); }
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 5) throw new Error('sequence must contain between one and five steps');
  let totalTimeoutMs = 0;
  return steps.map((step) => {
    if (!step || typeof step !== 'object' || Array.isArray(step) || typeof step.endpoint !== 'string'
      || !/^\/api\/internal\/[a-z0-9/-]+$/u.test(step.endpoint)) throw new Error('invalid internal API sequence step');
    const timeoutMs = Number(step.timeoutMs ?? 120_000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 5_520_000) throw new Error('invalid internal API sequence timeout');
    totalTimeoutMs += timeoutMs;
    if (totalTimeoutMs > 8_300_000) throw new Error('internal API sequence exceeds systemd time budget');
    if (step.continueOnError !== undefined && typeof step.continueOnError !== 'boolean') {
      throw new Error('invalid internal API sequence continueOnError');
    }
    return { endpoint: step.endpoint, payload: step.payload || {}, timeoutMs,
      continueOnError: step.continueOnError === true };
  });
}
