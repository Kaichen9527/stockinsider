-- StockInsider V3.16.10 production repair: the terminal ingestion wrapper
-- applies the staged calendar and its dependent chunks in one PostgreSQL
-- statement. The dependency resolver must see command-counter advances from
-- preceding writes instead of retaining a STABLE statement snapshot.

BEGIN;

ALTER FUNCTION public.resolve_legacy_trading_session_dependency_v3_16_9_internal(
  date,public.tw_market_v3,timestamptz,timestamptz
) VOLATILE;

DO $same_transaction_visibility$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_proc function
    JOIN pg_namespace namespace ON namespace.oid=function.pronamespace
    WHERE namespace.nspname='public'
      AND function.proname='resolve_legacy_trading_session_dependency_v3_16_9_internal'
      AND function.provolatile='v'
  ) THEN
    RAISE EXCEPTION 'same_transaction_dependency_visibility_unavailable';
  END IF;
END $same_transaction_visibility$;

COMMIT;
