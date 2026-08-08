-- StockInsider v5.20: allow social broker leak documents as non-formal broker evidence.

ALTER TABLE broker_report_documents
  DROP CONSTRAINT IF EXISTS broker_report_documents_source_mode_check;

ALTER TABLE broker_report_documents
  ADD CONSTRAINT broker_report_documents_source_mode_check
  CHECK (
    source_mode IN (
      'manual_pdf',
      'manual_csv',
      'imported_pdf',
      'public_summary',
      'broker_summary',
      'news_summary',
      'social_broker_leak'
    )
  );
