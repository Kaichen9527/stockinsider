# Trusted Cloud tester controller

Run the new controller only after reviewed runtime/migrations/capacity prerequisites
are met. It does not dispatch a Cloud chat, create a model process or activate
anything. RESEARCH_TEST_KEY remains in the trusted local controller environment;
do not put it in a work file, chat prompt or command argument.

1. Obtain rights-aware, cutoff-bound article evidence and the exact source commit.
   Prepare an input with the existing CloudWork fields except schemaVersion,
   workHash, reservationId, issuedAt and deadlineAt. It must use research_snapshot,
   deep_article_validation and independent_test. Input preparation is not proof
   of evidence truth or editorial approval.
2. Run `research:cloud-controller reserve --origin <operator origin> --input <absolute input> --output <new absolute work> --journal <new absolute journal>`.
   Use reviewed HTTPS or an explicitly established 127.0.0.1 tunnel; the public
   plaintext VPS URL cannot carry this bearer. Never retry a missing/ambiguous
   response by creating a new reservation. Inspect the journal/server ledger.
3. Pass only the saved credential-free work packet to the authorized Cloud task;
   run the existing `research:cloud run` with the same clean source and bounded
   workspace. The task enforces deadline/capacity and stores the hashed result.
4. Return the result to the trusted tester, then run
   `research:cloud-controller accept --origin <same operator origin> --work <original work> --result <absolute result> --output <new receipt> --journal <new journal>`.
   Local recomputation and server live checks must pass. Identical durable replay
   uses the original work/result, not a reconstructed or backdated packet.
5. Keep the accepted receipt as validation evidence. It does not publish an
   article, approve a thesis/strategy or authorize paper/live trades.

An empty output plus blocked journal means no lease was granted. An uncertain
journal means the request may have reached the receiver; do not infer failure
or success. A response_verified journal contains the exact packet/receipt for
operator recovery if the final destination write failed. Preserve these journals
until their server state is reconciled.

Local tests use synthetic evidence, a controlled HTTP server and isolated files.
They are not a live VPS lease, full article acceptance or successful scheduling.
