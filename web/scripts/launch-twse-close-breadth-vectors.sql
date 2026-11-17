-- Run after the TWSE committed breadth migration in a disposable database.
DO $checks$
DECLARE cutoff timestamptz:=statement_timestamp();
 market_session uuid:='00000000-0000-4000-8000-000000000001';
 report_day date:='2026-11-13';
 receipt jsonb;
 factor double precision;
BEGIN
 IF has_function_privilege('service_role','public.vnext_launch_twse_breadth_close_rows_v1(jsonb,uuid,text)','EXECUTE')
  OR has_function_privilege('anon','public.vnext_launch_twse_close_committed_v1(date,timestamptz,uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.vnext_launch_twse_close_prior_roster_covers_v1(text,timestamptz,jsonb)','EXECUTE')
  OR NOT has_function_privilege('opportunity_v3_rpc_owner','public.vnext_launch_twse_breadth_close_rows_v1(jsonb,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'incorrect close receipt permissions';END IF;
 IF public.vnext_launch_twse_close_committed_v1(report_day,cutoff+interval '10 minutes',market_session,NULL) IS NOT NULL
  OR public.vnext_launch_twse_close_committed_v1(report_day,cutoff,market_session,'invalid_hash') IS NOT NULL
  OR public.vnext_launch_twse_close_committed_v1(report_day,'2026-11-13T21:30:00+08:00',market_session,NULL) IS NOT NULL
  OR public.vnext_launch_twse_breadth_close_rows_v1('[]',market_session,'2330') IS DISTINCT FROM '[]'::jsonb
  OR public.vnext_launch_twse_close_prior_roster_covers_v1(repeat('a',64),cutoff,'{}') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'unverified close input accepted';END IF;

 receipt:='{"event":{"kind":"ex_right_dividend","session":"2026-11-14","sourceRowRef":"fixture","snapshotId":"fixture","ordinal":0},
  "terms":{"currency":"TWD","oldShares":100,"newShares":100,"cashDividendPerOldShare":50,"cashReturnPerOldShare":0,"subscriptionCashPerOldShare":0}}';
 receipt:=receipt||jsonb_build_object('receiptHash',repeat('a',64));
 factor:=public.vnext_launch_breadth_action_factor_v1(receipt->'event'||'{"beforeReference":2350,"afterReference":2300}',receipt,2350,true);
 IF factor IS DISTINCT FROM (2300::double precision/2350::double precision)
  OR public.vnext_launch_breadth_action_factor_v1(receipt->'event'||'{"beforeReference":2350,"afterReference":2300}',receipt,2351,true) IS NOT NULL
  OR public.vnext_launch_breadth_action_factor_v1(receipt->'event'||'{"beforeReference":2350,"afterReference":2300}',receipt,2350,false) IS NOT NULL
 THEN RAISE EXCEPTION 'incorrect cash-dividend close reconciliation';END IF;
END $checks$;
SELECT 'TWSE 11764 private receipt and cash-action vectors passed' AS result;
