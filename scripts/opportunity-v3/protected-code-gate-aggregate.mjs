import assert from 'node:assert/strict';

// Base-owned aggregate boundary. It receives parsed envelopes, but delegates
// their byte/graph validation to the protected worker's closed validator. No
// candidate export is imported or executed here.
export function validateProtectedCodeGateAggregateInputs({
  values,
  requiredChecks,
  validateEnvelope,
  validateReviewBinding,
}) {
  assert.ok(Array.isArray(values), 'protected aggregate inputs array');
  assert.ok(Array.isArray(requiredChecks) && requiredChecks.length > 0,
    'protected aggregate required checks');
  assert.equal(values.length, requiredChecks.length, 'protected aggregate input count');
  assert.equal(typeof validateEnvelope, 'function', 'protected aggregate envelope validator');
  assert.equal(typeof validateReviewBinding, 'function', 'protected aggregate review validator');
  const inputs = values.map((value, index) => {
    const expectedCheck = requiredChecks[index];
    const validated = validateEnvelope(value, expectedCheck);
    assert.equal(validated.result.check, expectedCheck, `protected aggregate input ${index} order`);
    validateReviewBinding(validated, expectedCheck);
    return Object.freeze({ check: validated.result.check, evidenceSha256: validated.result.evidenceSha256 });
  });
  return Object.freeze(inputs);
}
