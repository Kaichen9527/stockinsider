/** Preserve SQL bytes except standalone transaction wrappers. Dollar-quoted
 * function bodies and comments are lexical islands, not transaction commands. */
export function migrationBodyInAtomicTransaction(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new Error('migration_sql_empty');
  const statements = [];
  let start = 0, i = 0, visible = '';
  const finish = (end) => {
    if (visible.trim()) statements.push({ raw: sql.slice(start, end), visible: visible.trim() });
    start = end; visible = '';
  };
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const lineEnd = sql.slice(i + 2).search(/[\r\n]/u);
      i = lineEnd < 0 ? sql.length : i + 2 + lineEnd + 1; visible += ' '; continue;
    }
    if (sql.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new Error('migration_sql_unterminated_comment');
      visible += ' '; continue;
    }
    // Dollar quotes need a token boundary; dollar signs inside identifiers are not quotes.
    const boundary = i === 0 || !/[A-Za-z0-9_$\u0080-\uFFFF]/u.test(sql[i - 1]);
    const dollar = boundary ? sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u)?.[0] : undefined;
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      if (end < 0) throw new Error('migration_sql_unterminated_dollar_quote');
      i = end + dollar.length; visible += ' quoted_body '; continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      const escaped = quote === "'" && /(?:^|[^A-Za-z0-9_])[eE]$/u.test(sql.slice(Math.max(0, i - 2), i));
      i++; let closed = false;
      while (i < sql.length) {
        if (escaped && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      if (!closed) throw new Error('migration_sql_unterminated_quote');
      visible += ' quoted_value '; continue;
    }
    visible += sql[i]; i++;
    if (sql[i - 1] === ';') finish(i);
  }
  finish(sql.length);
  const control = /^(?:BEGIN\b|START\s+TRANSACTION\b|COMMIT\b|END\b|ROLLBACK\b|ABORT\b|SAVEPOINT\b|RELEASE\s+SAVEPOINT\b|PREPARE\s+TRANSACTION\b|SET\s+(?:LOCAL\s+)?TRANSACTION\b)/iu;
  const wrapped = statements.length >= 2 && /^BEGIN\s*;$/iu.test(statements[0].visible)
    && /^COMMIT\s*;$/iu.test(statements.at(-1).visible);
  const body = wrapped ? statements.slice(1, -1) : statements;
  for (const statement of body) {
    if (control.test(statement.visible)) throw new Error('migration_embedded_transaction_control');
    if (/^(?:VACUUM\b|(?:CREATE|DROP)\s+(?:DATABASE|TABLESPACE)\b|ALTER\s+SYSTEM\b|DISCARD\s+ALL\b)|^ALTER\s+DATABASE\b[^;]*\bSET\s+TABLESPACE\b|\b(?:INDEX|REINDEX)\s+CONCURRENTLY\b|\bREINDEX\s*\([^)]*\bCONCURRENTLY\b/iu.test(statement.visible))
      throw new Error('migration_nontransactional_statement');
  }
  if (!body.length) throw new Error('migration_sql_empty');
  return body.map((statement) => statement.raw).join('\n');
}
