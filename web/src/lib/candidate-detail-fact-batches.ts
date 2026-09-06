export function chunkCandidateFactIds(factIds: string[], batchSize = 40): string[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
    throw new Error('candidate_detail_fact_batch_size_invalid');
  }
  const unique = [...new Set(factIds.map(String).filter(Boolean))];
  const batches: string[][] = [];
  for (let offset = 0; offset < unique.length; offset += batchSize) {
    batches.push(unique.slice(offset, offset + batchSize));
  }
  return batches;
}
