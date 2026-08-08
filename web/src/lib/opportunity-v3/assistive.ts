export type AssistiveArtifactV3 = {
  artifactRef: string;
  artifactHash: string;
  artifactKind: 'news_sentiment' | 'embedding' | 'time_series';
  licenseId: string;
  licenseEvidenceRef: string;
  trainingCutoff: string;
  evaluationManifestRef: string;
  comparisonBaselineKey: string;
  outOfSample: { precisionAt20: number; ndcgAt20: number; worstDecileMae20Pct: number };
  influence: 'none';
};

export function publicAssistiveArtifacts(rows: AssistiveArtifactV3[], comparisonContractKey: string): AssistiveArtifactV3[] {
  const seen = new Set<string>();
  return rows
    .filter((row) =>
      row.influence === 'none' &&
      row.comparisonBaselineKey === comparisonContractKey &&
      /^[0-9a-f]{64}$/u.test(row.artifactHash) &&
      !seen.has(row.artifactHash) &&
      (seen.add(row.artifactHash), true))
    .sort((a, b) => a.artifactHash.localeCompare(b.artifactHash))
    .slice(0, 3);
}
