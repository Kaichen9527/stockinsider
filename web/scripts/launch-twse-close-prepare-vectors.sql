-- Run in an isolated database with the launch source preparation migration.
DO $test$
DECLARE
 day constant date:='2026-11-13';
 profile jsonb;
 parsed jsonb;
 header constant text:='日期,證券代號,證券名稱,收盤價,殖利率(%),股利年度,本益比,股價淨值比,財報年/季';
 row_a constant text:='20261113,2330,"Synthetic, name","1,320.00",unused,unused,unused,unused,unused';
 row_b constant text:='20261113,2454,Synthetic,--,unused,unused,unused,unused,unused';
 row_c constant text:='20261113,00999A,Synthetic,20,unused,unused,unused,unused,unused';
 invalid_rows text;
BEGIN
 profile:=public.vnext_launch_twse_close_profile_v1(day);
 IF profile->>'sourceUrl' IS DISTINCT FROM 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?response=open_data&date=20261113'
  OR profile->>'catalogKnownAt' IS DISTINCT FROM '2026-11-15T03:05:42.583197Z'
  OR profile->>'publisherRevision' IS NOT NULL THEN RAISE EXCEPTION 'wrong source profile';END IF;
 parsed:=public.vnext_launch_twse_close_rows_v1(day,convert_to(chr(65279)||concat_ws(E'\r\n',header,row_c,row_b,row_a,'',''),'UTF8'));
 IF parsed IS DISTINCT FROM '{"reportedRows":3,"quotes":[["2330",1320],["2454",null]]}'::jsonb THEN
  RAISE EXCEPTION 'wrong close-only projection: %',parsed;
 END IF;
 FOREACH invalid_rows IN ARRAY ARRAY[
  '',replace(row_a,'20261113','20261112'),replace(row_a,'"1,320.00"','5e3'),
  concat_ws(chr(10),row_a,row_a),row_a||',extra'
 ] LOOP
  BEGIN
   PERFORM public.vnext_launch_twse_close_rows_v1(day,convert_to(header||chr(10)||invalid_rows,'UTF8'));
   RAISE EXCEPTION SQLSTATE 'P7002' USING MESSAGE='accepted malformed report';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
 END LOOP;
 IF has_function_privilege('service_role','public.vnext_launch_twse_close_prepare_v1(date,date,timestamptz,timestamptz,text,bytea)','EXECUTE')
  OR has_function_privilege('anon','public.vnext_launch_twse_close_rows_v1(date,bytea)','EXECUTE') THEN
  RAISE EXCEPTION 'source preparation exposed';
 END IF;
END $test$;
SELECT 'TWSE 11764 profile, close-only CSV vectors and ACL passed' AS result;
