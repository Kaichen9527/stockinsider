from ingestion_pipeline import ingest_social_signals
from common import get_supabase_client


if __name__ == "__main__":
    client = get_supabase_client()
    count = ingest_social_signals(client)
    print("kol_scraper rows:", count)
