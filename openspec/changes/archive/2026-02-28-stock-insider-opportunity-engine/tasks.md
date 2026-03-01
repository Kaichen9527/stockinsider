## 1. Baseline Hardening

- [x] 1.1 Remove hardcoded credentials and move all secrets to environment variables
- [x] 1.2 Fix frontend TypeScript/build issues and ensure `web` build passes
- [x] 1.3 Standardize project env contracts (`.env.example`) for web/scraper/backend

## 2. Data Model and Storage

- [x] 2.1 Extend Supabase schema for market snapshots, institutional expectations, social sentiment confidence, and recommendation lifecycle
- [x] 2.2 Add indexes/constraints for symbol-date queries and strategy state lookups
- [x] 2.3 Add migration script and apply flow for local/dev/prod consistency

## 3. Ingestion Pipeline

- [x] 3.1 Implement TW/US market-signal ingestion adapters with freshness metadata
- [x] 3.2 Implement institutional report parser adapter and expectation extraction mapping
- [x] 3.3 Implement KOL/forum ingestion (PTT/Threads + configured KOL list) with source trust weight
- [x] 3.4 Implement ETL normalization and failure/retry logging

## 4. Recommendation Strategy Engine

- [x] 4.1 Implement daily recommendation scorer combining market, institutional, social, and technical signals
- [x] 4.2 Implement strategy record generator (buy condition, size guidance, target, stop-loss, review horizon)
- [x] 4.3 Implement strategy state transition evaluator and event emitter

## 5. Product Outputs

- [x] 5.1 Replace dashboard mock data with Supabase-backed query/API data
- [x] 5.2 Replace stock detail mock data with real K-line/chip/strategy data
- [x] 5.3 Implement recommendation rationale and confidence display blocks

## 6. LINE Personalization

- [x] 6.1 Implement LINE binding flow persistence with user preferences
- [x] 6.2 Implement personalized LINE notification dispatcher from strategy events
- [x] 6.3 Add alert throttling and opt-in filters to reduce noise

## 7. Verification

- [x] 7.1 Add smoke tests for daily run pipeline (ingest -> score -> strategy update)
- [x] 7.2 Add integration test for LINE event dispatch on strategy transition
- [x] 7.3 Document operation runbook for daily jobs and failure handling
