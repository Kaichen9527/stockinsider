BEGIN READ ONLY;
SET LOCAL statement_timeout='12s';
SET LOCAL TIME ZONE 'UTC';
WITH eligible AS (
 SELECT m.*,s.symbol FROM public.candidate_source_mentions m JOIN public.stocks s ON s.id=m.stock_id
 WHERE m.available_at >= now()-interval '7 days' AND m.available_at<=now()
 AND COALESCE(m.provenance->>'discovery_eligible','true') <> 'false'
 AND COALESCE(m.provenance->>'invalidated','false') <> 'true'
 AND (lower(m.platform)<>'gdelt' OR (m.provenance->>'discovery_eligible'='true' AND m.provenance->>'matcher_version'='gdelt-tw-context-v2'))
), grouped AS (
 SELECT symbol,count(*) AS mentions,count(DISTINCT publisher_key) FILTER (WHERE nullif(publisher_key,'') IS NOT NULL) AS publisher_keys,
 count(DISTINCT platform) AS platforms, count(DISTINCT source_url) AS urls
 FROM eligible GROUP BY symbol
)
SELECT json_build_object('cutoff',now(),'window','available_at last7days; diagnostic not lineage qualification',
 'symbols',count(*),'atLeastTwoPublisherKeys',count(*) FILTER (WHERE publisher_keys>=2),
 'atLeastTwoPlatforms',count(*) FILTER (WHERE platforms>=2),'atLeastTwoUrls',count(*) FILTER (WHERE urls>=2),
 'singlePublisherOrMissing',count(*) FILTER (WHERE publisher_keys<2),'missingIndependentRoots',true) FROM grouped;
ROLLBACK;
