// A small DELIMITER-aware reader, not a SQL rewriter. Each file is native MySQL.
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
