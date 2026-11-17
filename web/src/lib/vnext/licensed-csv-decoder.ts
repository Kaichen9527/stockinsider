/** Pure bounded RFC4180 decoder shared by licensed CSV profiles. No source,
 * transport, unit or admission authority is granted by decoding fields. */
export function decodeLicensedCsvRecords(input: string, maximumRows: number, maximumColumns = 32) {
  const fail = (code: string): never => { throw Error(code); };
  const value = input.startsWith('\uFEFF') ? input.slice(1) : input;
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false;
  const endField = () => { row.push(field); field = ''; closed = false; if (row.length > maximumColumns) fail('official_csv_column_bound'); };
  const endRow = () => { endField(); rows.push(row); row = []; if (rows.length > maximumRows) fail('official_csv_row_bound'); };
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quoted) {
      if (c === '"') { if (value[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === ',') endField();
    else if (c === '\r' || c === '\n') { if (c === '\r' && value[++i] !== '\n') fail('official_csv_line_ending_invalid'); endRow(); }
    else if (closed) fail('official_csv_quote_invalid');
    else if (c === '"') { if (field !== '') fail('official_csv_quote_invalid'); quoted = true; }
    else field += c;
    if (field.length > 1024) fail('official_csv_cell_bound');
  }
  if (quoted) fail('official_csv_quote_invalid');
  if (field !== '' || closed || row.length) endRow();
  return rows;
}
