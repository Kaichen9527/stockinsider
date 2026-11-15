-- Run against an isolated PostgreSQL instance after applying the breadth migrations:
-- psql -X -v ON_ERROR_STOP=1 -f web/scripts/launch-breadth-cash-action-vectors.sql
DO $checks$
DECLARE fixture record;action jsonb;receipt jsonb;actual double precision;
BEGIN
 FOR fixture IN SELECT * FROM (VALUES
  ('cash dividend','ex_right_dividend',101.25,98.75,101.25,true,100,100,2.50,0,0,'TWD',98.75/101.25),
  ('suspended cash reduction','capital_reduction',99,108,99,false,100,75,0,18,0,'TWD',108.0/99),
  ('loss-only reduction','capital_reduction',100,125,100,false,100,80,0,0,0,'TWD',1.25),
  ('forward split','par_value_change',120,60,120,false,100,200,0,0,0,'TWD',0.5),
  ('reverse split','par_value_change',100,200,100,true,100,50,0,0,0,'TWD',2),
  ('missing preceding session','ex_right_dividend',101.25,98.75,101.25,false,100,100,2.50,0,0,'TWD',NULL),
  ('missing preceding close','capital_reduction',99,108,NULL,false,100,75,0,18,0,'TWD',NULL),
  ('mismatched preceding close','capital_reduction',99,108,99.05,false,100,75,0,18,0,'TWD',NULL),
  ('rounded reference','capital_reduction',99,107.99,99,false,100,75,0,18,0,'TWD',NULL),
  -- Recorded report/issuer terms. Exact admission must not invent rounding or swap the auction tick.
  ('published TWSE 1808 reduction reference','capital_reduction',31.00,36.25,31.00,false,893031743,714425393,0,2,0,'TWD',NULL),
  ('published TWSE 3714 reduction reference','capital_reduction',56.70,96.15,56.70,false,737940460,400000000,0,4.579508488,0,'TWD',NULL),
  ('TWSE 3714 auction tick is not the reduction reference','capital_reduction',56.70,96.20,56.70,false,737940460,400000000,0,4.579508488,0,'TWD',NULL),
  ('cash increase','ex_right_dividend',101.25,98.75,101.25,true,100,125,2.50,0,1,'TWD',NULL),
  ('dividend with changed shares','ex_right_dividend',101.25,79,101.25,true,100,125,2.50,0,0,'TWD',NULL),
  ('reduction with dividend','capital_reduction',100,108,100,false,100,75,1,18,0,'TWD',NULL),
  ('split with refund','par_value_change',120,55,120,false,100,200,0,10,0,'TWD',NULL),
  ('unrecognised currency','ex_right_dividend',101.25,98.75,101.25,true,100,100,2.50,0,0,'USD',NULL),
  ('unsupported kind','capital_increase',100,100,100,true,100,100,0,0,0,'TWD',NULL)
 ) cases(label,kind,before_ref,after_ref,preceding,adjacent,old_shares,new_shares,dividend,refund,subscription,currency,expected) LOOP
  action:=jsonb_build_object('kind',fixture.kind,'session','2026-11-09','sourceRowRef',repeat('a',64),
   'snapshotId','00000000-0000-4000-8000-000000000001','ordinal',0,'beforeReference',fixture.before_ref,'afterReference',fixture.after_ref);
  receipt:=jsonb_build_object('event',action-'beforeReference'-'afterReference','receiptHash',repeat('b',64),
   'terms',jsonb_build_object('oldShares',fixture.old_shares,'newShares',fixture.new_shares,'cashDividendPerOldShare',fixture.dividend,
    'cashReturnPerOldShare',fixture.refund,'subscriptionCashPerOldShare',fixture.subscription,'currency',fixture.currency));
  actual:=public.vnext_launch_breadth_action_factor_v1(action,receipt,fixture.preceding,fixture.adjacent);
  IF (actual IS NULL)<>(fixture.expected IS NULL) OR abs(actual-fixture.expected::double precision)>1e-12 THEN
   RAISE EXCEPTION 'unexpected factor in %: %',fixture.label,actual;
  END IF;
 END LOOP;
END $checks$;
SELECT '18 breadth corporate-action comparison vectors passed' AS result;
