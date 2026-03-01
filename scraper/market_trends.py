from ingestion_pipeline import run_daily_ingestion


if __name__ == "__main__":
    summary = run_daily_ingestion()
    print("market_trends summary:", summary)
