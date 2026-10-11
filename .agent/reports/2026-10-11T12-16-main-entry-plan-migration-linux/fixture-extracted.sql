
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE stockinsider_managed_migrator LOGIN NOSUPERUSER CREATEROLE BYPASSRLS;
    CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    -- The production table carries its full source-profile shape. Keep
    -- optional fields nullable in this focused legacy fixture because several
    -- unrelated historical tests deliberately insert only an identity UUID.
    CREATE TABLE public.source_entities(
      id uuid PRIMARY KEY,
      platform varchar(40),
      entity_type varchar(40),
      display_name varchar(255),
      source_key varchar(255) UNIQUE,
      profile_url text,
      status varchar(20) NOT NULL DEFAULT 'active',
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE public.stocks(id uuid PRIMARY KEY, symbol text);
    CREATE TABLE public.stock_signals(
      id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
      stock_id uuid NOT NULL REFERENCES public.stocks(id),
      as_of timestamptz NOT NULL,
      source text NOT NULL,
      price numeric NOT NULL,
      volume bigint,
      ma_short numeric,
      ma_mid numeric,
      ma_long numeric,
      rsi numeric,
      macd numeric,
      macd_signal numeric,
      chip_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
      technical_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      freshness_status text NOT NULL,
      source_timestamp timestamptz NOT NULL,
      ingested_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE public.revenue_signals(
      id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
      stock_id uuid NOT NULL REFERENCES public.stocks(id),
      as_of_date date NOT NULL,
      monthly_revenue numeric NOT NULL,
      yoy_growth numeric,
      mom_growth numeric,
      source_url text,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE public.market_snapshots(
      id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
      market text NOT NULL,
      as_of timestamptz NOT NULL,
      source text NOT NULL,
      source_key text,
      sector_flows jsonb NOT NULL DEFAULT '{}'::jsonb,
      index_state jsonb NOT NULL DEFAULT '{}'::jsonb,
      freshness_status text NOT NULL,
      source_timestamp timestamptz NOT NULL,
      ingested_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    ALTER DATABASE postgres OWNER TO stockinsider_managed_migrator;
    ALTER SCHEMA public OWNER TO stockinsider_managed_migrator;
    GRANT USAGE ON SCHEMA extensions TO stockinsider_managed_migrator WITH GRANT OPTION;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO stockinsider_managed_migrator WITH GRANT OPTION;
    GRANT ALL PRIVILEGES ON TABLE public.source_entities,public.stocks,public.stock_signals,
      public.revenue_signals,public.market_snapshots
      TO stockinsider_managed_migrator WITH GRANT OPTION;
