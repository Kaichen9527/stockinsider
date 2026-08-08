#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const datasetPath = argValue('--dataset', path.join(process.cwd(), '.agent', 'datasets', 'stockinsider-hf-signals.jsonl'));
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

function main() {
  const issues = [];
  const warnings = [];
  let validTrainingRows = 0;
  const samples = [];
  if (!fs.existsSync(datasetPath)) {
    issues.push(`dataset_missing:${datasetPath}`);
  } else {
    const lines = fs.readFileSync(datasetPath, 'utf8').split('\n').filter(Boolean);
    if (lines.length < 20) issues.push(`dataset_too_small:${lines.length}`);
    for (const [index, line] of lines.slice(0, 250).entries()) {
      try {
        const row = JSON.parse(line);
        samples.push(row);
        const hasText = row.text && String(row.text).trim().length >= 20;
        const hasSource = row.source_id || row.sourceUrl || row.document_url;
        const hasSymbol = (Array.isArray(row.symbols) && row.symbols.length > 0) || row.symbol;
        const hasSentiment = row.sentiment || row.sentiment_label;
        const hasEvidence = row.evidence_strength || row.evidenceStrength || row.evidence_strength_label;
        if (!hasText) warnings.push(`row_${index}:low_information_text`);
        if (!hasSource) issues.push(`row_${index}:missing_source_pointer`);
        if (!hasSymbol) warnings.push(`row_${index}:missing_symbol_label`);
        if (!hasSentiment) issues.push(`row_${index}:missing_sentiment_label`);
        if (!hasEvidence) issues.push(`row_${index}:missing_evidence_strength_label`);
        if (hasText && hasSource && hasSymbol && hasSentiment && hasEvidence) validTrainingRows += 1;
      } catch (err) {
        issues.push(`row_${index}:invalid_json:${err.message}`);
      }
    }
    if (validTrainingRows < 50) issues.push(`valid_training_rows_too_low:${validTrainingRows}`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `hf-training-dataset-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ datasetPath, passed: issues.length === 0, sampleCount: samples.length, validTrainingRows, warnings: warnings.slice(0, 50), issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`HF training dataset audit failed: ${issues.slice(0, 20).join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('HF training dataset audit: pass');
  console.log(`Report: ${reportPath}`);
}

main();
