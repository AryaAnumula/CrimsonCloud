// A small DELIMITER-aware reader, not a SQL rewriter: each file stays native MySQL.
// Splits a .sql file into single statements, honouring `DELIMITER $$` blocks so triggers and
// procedures (which contain semicolons) stay whole. Comment-only and blank lines are skipped;
// returns the statements in order, or throws if the file ends mid-statement.
// Note this only understands DELIMITER — it is deliberately not a parser.
export function statements(text) {
  let delimiter = ';', buffer = ''; const result = [];
  for (const line of text.split(/\r?\n/)) {
    const change = line.trim().match(/^DELIMITER\s+(\S+)$/i);
    if (change) { if (buffer.trim()) throw new Error('Unexpected content before DELIMITER'); delimiter = change[1]; continue; }
    if (!buffer && (!line.trim() || line.trim().startsWith('--'))) continue;
    buffer += line+'\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      result.push(buffer.trimEnd().slice(0,-delimiter.length).trim()); buffer='';
    }
  }
  if (buffer.trim()) throw new Error('Unterminated SQL statement');
  return result;
}
