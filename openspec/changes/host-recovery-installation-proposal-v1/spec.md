# Host recovery installation proposal v1

Status: implementation candidate; independent review and all external authority
remain pending. This additive proposal does not amend approved active acceptance
or register a successor on the protected base.

Authorized scope: prepare a nonexecuting installer plan and an external trusted
validation interface for the frozen e94d21f recovery subject, on an isolated new
branch. No install, signature generation outside tests, authority bootstrap,
secret change, ruleset change, main mutation, check publication or deployment.

Requirements:

- R1: Pin the exact canonical source facts reconstructed from predecessor
  169aad1 and candidate e94d21f Git objects. New installer proposal source is a
  separate identity and cannot silently replace the subject.
- R2: Emit a deterministic unsigned plan with all missing deployment fields and
  external evidence obligations. Absent contract values must never be guessed.
- R3: Reuse the unchanged frozen packet verifier. Require all three signed review
  envelopes to bind exact plan bytes, complete deployment contract and immutable
  external report bytes, in addition to existing packet bindings.
- R4: Fail closed without externally verified authority, current predecessor,
  independent reviews, fresh host/control-plane identity, durable predecessor
  CAS/permanent retention and base-owned installation permission. A pure trusted
  context parameter describes the caller boundary; it cannot establish trust.
- R5: Define a finite external sequence with durable consumption before any
  installation, exact staging/atomic worker-registry-base installation, fresh
  protected checks and authentic root verification. Real adapters remain absent
  until their deployment/atomicity/permission contracts are supplied and reviewed.
- R6: Validation never reserves, installs, activates or authorizes execution.
  CLI only reads bounded explicit files and writes unsigned stdout. Candidate
  CLI/environment cannot supply authority. Unknown schemas/options fail closed.
- R7: Test adversarial binding/canonicalization/missing-dependency cases with
  explicitly synthetic keys. Preserve active base SQL, workflows, rulesets,
  runner pins, packet verifier and approval registries unchanged.

Acceptance is local proposal behavior only, never protected release acceptance.
