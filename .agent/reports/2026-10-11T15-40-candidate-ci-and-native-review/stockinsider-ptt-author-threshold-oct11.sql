BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL TIME ZONE 'UTC';
WITH replies AS (
 SELECT r.document_url,r.metadata->>'parent_document_url' parent_url,
 lower(trim(r.metadata->>'author_name')) author, r.content_text,
 jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.symbols)='array' THEN r.symbols ELSE '[]'::jsonb END) symbol
 FROM public.source_raw_documents r
 WHERE r.platform='ptt' AND r.collected_at>=now()-interval '7 days'
 AND r.collected_at<=now() AND r.metadata->>'source_surface'='ptt_stock_push'
), grouped AS (
 SELECT p.parent_url,p.symbol,count(*) retained_reply_rows,count(DISTINCT p.author) authors,
 count(DISTINCT p.author) FILTER(WHERE p.content_text ~ ('(^|[^0-9A-Za-z])'||p.symbol||'([^0-9A-Za-z]|$)')) explicit_code_authors,
 bool_or(a.content_text ~ ('(^|[^0-9A-Za-z])'||p.symbol||'([^0-9A-Za-z]|$)')) parent_title_explicit_code
 FROM replies p LEFT JOIN public.source_raw_documents a ON a.platform='ptt' AND a.document_url=p.parent_url
 WHERE p.symbol ~ '^[0-9]{4}$' AND nullif(p.author,'') IS NOT NULL
 GROUP BY p.parent_url,p.symbol
)
SELECT json_build_object('cutoff',now(),'window','retained raw PTT reply documents collected last7days',
 'articleSymbolPairs',count(*),'maxRetainedUniqueAuthors',max(authors),'maxExplicitCodeAuthors',max(explicit_code_authors),
 'pairsWithTwentyExplicitCodeAuthors',count(*) FILTER(WHERE explicit_code_authors>=20 AND parent_title_explicit_code),
 'warning','diagnostic only; excludes unavailable replies; does not certify source independence or investment qualification',
 'top', (SELECT json_agg(x) FROM (SELECT parent_url,symbol,retained_reply_rows,authors,explicit_code_authors,parent_title_explicit_code FROM grouped ORDER BY explicit_code_authors DESC,authors DESC LIMIT 12) x)) FROM grouped;
ROLLBACK;
