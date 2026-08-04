import { canonicalJson, sha256Canonical } from './canonical.ts';

export const STATIC_IDENTITY_MEMBERS_V3 = [
  ['acceptanceVersion','1.44.6'],['analysisRevisionContractVersion','stock-analysis-revision-v3.11.2'],
  ['authoritySupersessionContractVersion','authority-supersession-v3.2'],['controlPlaneContractVersion','opportunity-control-v3.3'],
  ['dataContractVersion','source-led-opportunity-v3.6'],['decisionContractVersion','opportunity-decisions-v3.3'],
  ['detailContractVersion','opportunity-detail-v3.3'],['discoveryCorrectnessContractVersion','stock-discovery-v3.11.1'],
  ['entityLinkContractVersion','entity-link-v3.1'],['evaluationContractVersion','source-led-eval-v3.7'],
  ['factorCorrectnessContractVersion','opportunity-factor-correctness-v3.11.6'],['featureScoringContractVersion','opportunity-features-v3.2'],
  ['financialInputContractVersion','opportunity-financial-inputs-v3.3'],['hybridProductVersion','hybrid-product-v3.2'],
  ['instrumentRosterContractVersion','tw-instrument-roster-v3.0'],['internalPrincipalContractVersion','internal-principal-v3.8'],
  ['jobGraphContractVersion','opportunity-job-graph-v3.15'],['legacyCompatibilityContractVersion','legacy-compatibility-v3.2'],
  ['manifestStorageContractVersion','opportunity-manifest-storage-v3.10'],['marketContextContractVersion','market-context-v3.6'],
  ['moverAuditPriceContractVersion','mover-audit-price-v3.3'],['portfolioContextContractVersion','research-basket-v3.0'],
  ['postgresTypeContractVersion','opportunity-postgres-types-v3.21'],['priceProviderAllowlistHash','48fa54ee9f0e3a0b888ac0dc17eda8ad5bb746106a6fe4395eb50a5865e4e44e'],
  ['providerFieldAllowlistHash','fe78e0f8c5b0846f822f72c6b2356cac35ed5c00dd0bcd06f9a75b7c5b21d3f7'],['publisherVerificationPolicyHash','2c4746cb02d98d402ecd1d0d980c91632b8105ab9fd2aec198e7789da603abba'],
  ['runtimeContractVersion','opportunity-runtime-v3.17'],['sectorBenchmarkContractVersion','sector-benchmark-v3.1'],
  ['sectorCycleContractVersion','sector-cycle-v3.0'],['sectorReferenceContractVersion','sector-reference-v3.1'],
  ['sectorTaxonomyContractVersion','tw-sector-taxonomy-v3.0'],['sourceAdapterContractVersion','source-adapter-v3.3'],
  ['sourceAdapterRegistryHash','a14d4753f221a43fb0422710e705ee00f529d9f31653a142211fe94596da80fe'],['sourceDatasetContractVersion','source-dataset-v3.3'],
  ['sourceFunnelContractVersion','source-funnel-v3.0'],['sourceFunnelPolicyHash','6893fb5f265edc10eea8222a560f9afdcc4342f72b1d7d39d5723ec0056bc105'],
  ['storageContractVersion','opportunity-storage-v3.24'],['taxonomyMapHash','6b28d85903d7a410eef29386de011c71aa789dc0ce3231df38cb4e085181060c'],
  ['technicalDecisionContractVersion','opportunity-technical-decision-v3.11.1'],['tradingCalendarContractVersion','tw-trading-calendar-v3.4'],
  ['valuationContractVersion','opportunity-valuation-v3.4'],
] as const;

export const COMPARISON_PREIMAGE_V3 = ['opportunity-comparison-contract-v3.0', ['staticIdentityMembers', STATIC_IDENTITY_MEMBERS_V3]] as const;
export const COMPARISON_PREIMAGE_CANONICAL_V3 = canonicalJson(COMPARISON_PREIMAGE_V3);
export const COMPARISON_CONTRACT_KEY_V3 = sha256Canonical(COMPARISON_PREIMAGE_V3);

if (STATIC_IDENTITY_MEMBERS_V3.length !== 41) throw new Error('comparison identity must contain exactly 41 members');
if (COMPARISON_PREIMAGE_CANONICAL_V3.length !== 2729) throw new Error('comparison identity canonical length mismatch');
if (COMPARISON_CONTRACT_KEY_V3 !== 'ebaa6dbdaa7dd55bb261187008f51e930919e7c0cfe07732d531e01267e67c41') throw new Error('comparison identity digest mismatch');
