/** Test-only oversized request; never mutate the shared original immutable lineage. */
export function oversizedReviewerFixture(request) {
 const fixture=structuredClone(request);fixture.input.owner='x'.repeat(9000);return fixture;
}
