-- SELECT-only synthetic arithmetic witness. NOT a source producer, formal
-- review, actual ranking, migration or authorization to execute Cloud PG.
-- Run ONLY in an independently authorized isolated PG environment. The psql
-- variable vector must select one listed label; use -X -qAt, ON_ERROR_STOP=1.
-- Raw signed share sums stay NUMERIC/exact before safe-range cast. All exposed
-- price/return/ratio operands and comparisons use binary64, never NUMERIC math.
SET extra_float_digits=3;
WITH vectors(label,stock_return,market_return,raw_net_parts,depth,distance,contraction) AS (
 VALUES
 ('negative_excess',.1::numeric,.3::numeric,ARRAY[1]::numeric[],.1::numeric,.02::numeric,.7::numeric),
 ('positive_excess',.3,.1,ARRAY[1]::numeric[],.1,.02,.7),
 ('positive_tiny',1e-300,0,ARRAY[1]::numeric[],.1,.02,.7),
 ('negative_tiny',-1e-300,0,ARRAY[1]::numeric[],.1,.02,.7),
 ('known_zero',0,0,ARRAY[0]::numeric[],.1,.02,.7),
 ('depth_below',.4,.1,ARRAY[1]::numeric[],.14999999999999997,.02,.7),
 ('depth_exact',.4,.1,ARRAY[1]::numeric[],.15,.02,.7),
 ('depth_above',.4,.1,ARRAY[1]::numeric[],.15000000000000002,.02,.7),
 ('distance_exact',.4,.1,ARRAY[1]::numeric[],.1,.05,.7),
 ('distance_above',.4,.1,ARRAY[1]::numeric[],.1,.05000000000000001,.7),
 ('ratio_exact',.4,.1,ARRAY[1]::numeric[],.1,.02,.8),
 ('ratio_above',.4,.1,ARRAY[1]::numeric[],.1,.02,.8000000000000002),
 ('signed_ratio',.4,.1,ARRAY[-3]::numeric[],.1,.02,.7),
 ('positive_third',.4,.1,ARRAY[1]::numeric[],.1,.02,.7),
 ('signed_third',.4,.1,ARRAY[-1]::numeric[],.1,.02,.7),
 ('equal_rs63_tie',.4,.1,ARRAY[1]::numeric[],.1,.02,.7),
 ('integer_cancellation',.4,.1,ARRAY[9007199254740991,2,-9007199254740991]::numeric[],.1,.02,.7)
), exact_nets AS (
 SELECT v.*, (SELECT sum(part) FROM unnest(v.raw_net_parts) part) AS raw_net,
 CASE WHEN label IN ('positive_third','signed_third') THEN 3::bigint ELSE 10::bigint END AS raw_volume
 FROM vectors v WHERE label=:'vector'
), operands AS (
 SELECT label,stock_return::double precision AS stock,market_return::double precision AS market,
 CASE WHEN stock_return::double precision-market_return::double precision=0::double precision THEN 0::double precision
      ELSE stock_return::double precision-market_return::double precision END AS excess,
 raw_net::bigint AS net,raw_volume AS volume,
 CASE WHEN raw_net=0 THEN 0::double precision ELSE raw_net::double precision/raw_volume::double precision END AS ratio,
 depth::double precision AS depth,distance::double precision AS distance,contraction::double precision AS contraction
 FROM exact_nets WHERE raw_net BETWEEN -9007199254740991 AND 9007199254740991
), context AS (
 SELECT '00000000-0000-4000-8000-000000000001'::text AS run,
 '00000000-0000-4000-8000-000000000010'::text AS research,
 '00000000-0000-4000-8000-000000000100'::text AS score,
 '00000000-0000-4000-8000-000000000200'::text AS qualification,
 '2026-11-13T13:30:00Z'::text AS cutoff,'2026-11-13'::text AS session,
 jsonb_build_object('research','00000000-0000-4000-8000-000000000010','score','00000000-0000-4000-8000-000000000100',
 'qualification','00000000-0000-4000-8000-000000000200','price','synthetic-price','calendar','synthetic-calendar','actions','synthetic-actions',
 'technicalVolume','synthetic-11371','institutionalVolume','synthetic-11370','flow','synthetic-11856','market',repeat('d',64)) AS refs
), rule_rows AS (
 SELECT o.label,c.*,r.ordinal,r.id,r.grp,r.weight,r.met,r.values_json,
 CASE WHEN r.met THEN r.weight ELSE 0 END AS points
 FROM operands o CROSS JOIN context c CROSS JOIN LATERAL(VALUES
 (0,'trend_close_above_ma50','trendRelativeStrength',5,110::double precision>100::double precision,jsonb_build_object('close',110::double precision,'ma50',100::double precision)),
 (1,'trend_ma50_above_ma200','trendRelativeStrength',5,100::double precision>90::double precision,jsonb_build_object('ma50',100::double precision,'ma200',90::double precision)),
 (2,'trend_ma200_rising_5sessions','trendRelativeStrength',5,90::double precision>89::double precision,jsonb_build_object('ma200',90::double precision,'priorMa200',89::double precision,'priorEndpoint','2026-11-06')),
 (3,'trend_excess_return20_positive','trendRelativeStrength',5,(.2::double precision-.1::double precision)>0::double precision,jsonb_build_object('stockReturn',.2::double precision,'marketReturn',.1::double precision,'excessReturn',.2::double precision-.1::double precision)),
 (4,'trend_excess_return63_positive','trendRelativeStrength',5,o.excess>0::double precision,jsonb_build_object('stockReturn',o.stock,'marketReturn',o.market,'excessReturn',o.excess)),
 (5,'consolidation_depth_within15pct','consolidation',10,o.depth<=.15::double precision,jsonb_build_object('depth',o.depth)),
 (6,'consolidation_distance_within5pct','consolidation',5,o.distance<=.05::double precision,jsonb_build_object('distance',o.distance)),
 (7,'consolidation_prior_atr_ratio_within08','consolidation',5,o.contraction<=.8::double precision,jsonb_build_object('ratio',o.contraction,'throughSession','2026-11-12')),
 (8,'consolidation_volume_ratio_within08','consolidation',5,o.contraction<=.8::double precision,jsonb_build_object('ratio',o.contraction)),
 (9,'breakout_or_fixed_closing_hold','breakoutHold',20,true,jsonb_build_object('breakout',true,'closingHold',NULL,'originalSession',NULL,'originalLevel',NULL)),
 (10,'chips_foreign5_positive','chips',5,o.net::double precision>0::double precision,jsonb_build_object('netShares',o.net,'volumeShares',o.volume,'netVolumeRatio',o.ratio)),
 (11,'chips_foreign20_positive','chips',5,20::double precision>0::double precision,jsonb_build_object('netShares',20,'volumeShares',400,'netVolumeRatio',20::double precision/400::double precision)),
 (12,'chips_trust5_positive','chips',5,10::double precision>0::double precision,jsonb_build_object('netShares',10,'volumeShares',100,'netVolumeRatio',10::double precision/100::double precision)),
 (13,'chips_trust20_positive','chips',5,40::double precision>0::double precision,jsonb_build_object('netShares',40,'volumeShares',400,'netVolumeRatio',40::double precision/400::double precision)),
 (14,'market_close_above_ma50','market',5,150::double precision>140::double precision,jsonb_build_object('close',150::double precision,'ma50',140::double precision)),
 (15,'market_close_above_ma200','market',5,150::double precision>120::double precision,jsonb_build_object('close',150::double precision,'ma200',120::double precision))
 )r(ordinal,id,grp,weight,met,values_json)
), grouped AS (
 SELECT label,grp,sum(points)::integer AS points FROM rule_rows GROUP BY label,grp
), totals AS (
 SELECT label,jsonb_object_agg(grp,points) AS components,sum(points)::integer AS total,
 sum(points) FILTER(WHERE grp IN('trendRelativeStrength','consolidation','breakoutHold'))::integer AS technical FROM grouped GROUP BY label
), evidence AS (
 SELECT label,jsonb_agg(jsonb_build_object('id',id,'group',grp,'weight',weight,'matches',met,'points',points,'operands',values_json,
 'cutoff',cutoff,'throughSession',session,'revisions',refs) ORDER BY ordinal) AS rules FROM rule_rows GROUP BY label
), members AS (
 SELECT o.label,jsonb_agg(jsonb_build_object('rank',m.rank,'symbol',m.symbol,'revisionId',m.research,
 'inputHash',repeat(m.hash_character,64),'scoreRevision',m.score,'launchQualificationRevision',m.qualification,
 'totalScore',t.total,'availableWeight',100,'technicalScore',t.technical,'relativeStrength63',o.excess,'components',t.components,
 'entryEligible',false,'reasons','[]'::jsonb,'revisions',c.refs||jsonb_build_object('research',m.research,'score',m.score,'qualification',m.qualification),'financial',NULL,'valuation',NULL)
 ORDER BY t.total DESC,t.technical DESC,o.excess::double precision DESC,m.symbol ASC) AS items
 FROM operands o CROSS JOIN context c JOIN totals t ON t.label=o.label
 CROSS JOIN LATERAL(VALUES
 (2,'5275','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201','b'),
 (1,'5274',c.research,c.score,c.qualification,'a')
 )m(rank,symbol,research,score,qualification,hash_character)
 WHERE m.rank=1 OR o.label='equal_rs63_tie'
 GROUP BY o.label
)
SELECT jsonb_build_object('schemaVersion','vnext-launch-ranking-read-v2','arithmeticVersion','binary64-v1','availability','ready','reason',NULL,
 'snapshot',jsonb_build_object('schemaVersion','vnext-launch-ranking-snapshot-v2','policyVersion','stockinsider-launch-radar-v1','rulesVersion','launch-radar-comparisons-v5','arithmeticVersion','binary64-v1',
 'rankingRunId',c.run,'previousRankingRunId',NULL,'cutoff',c.cutoff,'inputCutoff',c.cutoff,'session',c.session,'publishedAt','2026-11-13T13:31:00Z','marketRevision',repeat('d',64),
 'market',jsonb_build_object('session',c.session,'risk','risk_on','confidence','complete','sourceAt','2026-11-13T13:20:00Z','expiresAt','2026-11-14T13:30:00Z','reasons','[]'::jsonb,'conditions','[]'::jsonb,'gaps','[]'::jsonb),
 'members',m.items,
 'candidates',jsonb_build_array(jsonb_build_object('symbol','5274','state','waiting','reasons',jsonb_build_array('synthetic_arithmetic_witness_only')))
 ||CASE WHEN o.label='equal_rs63_tie' THEN jsonb_build_array(jsonb_build_object('symbol','5275','state','waiting','reasons',jsonb_build_array('synthetic_arithmetic_witness_only'))) ELSE '[]'::jsonb END,'changes','[]'::jsonb),
 'current',jsonb_build_object('schemaVersion','vnext-launch-current-validity-v2','arithmeticVersion','binary64-v1','members','[]'::jsonb),
 'detail',jsonb_build_object('arithmeticVersion','binary64-v1','rankingRunId',c.run,'symbol','5274','revisionId',c.research,'scoreRevision',c.score,'launchQualificationRevision',c.qualification,'inputHash',repeat('a',64),
 'summary','Synthetic SQL arithmetic witness only; not research, source or ranking authority.','scoreEvidence',e.rules,'citations','[]'::jsonb,'chart',NULL))
FROM operands o CROSS JOIN context c JOIN totals t ON t.label=o.label JOIN evidence e ON e.label=o.label JOIN members m ON m.label=o.label;
