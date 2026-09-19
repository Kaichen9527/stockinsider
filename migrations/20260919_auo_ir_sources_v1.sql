-- AUO official IR document source approval. This is issuer-scoped and does
-- not create a general-purpose external URL allowlist.
BEGIN;

INSERT INTO public.candidate_issuer_document_domains_v6(stock_id,host,note)
SELECT id,'www.auo.com','reviewed issuer IR financial-statement fallback for 2409'
FROM public.stocks WHERE symbol='2409' AND market='TW'
ON CONFLICT (stock_id,host) DO NOTHING;

COMMIT;
