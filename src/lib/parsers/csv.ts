/** Tiny shared CSV utilities used by non-IBKR parsers. */

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') inQuotes = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsvText(csv: string): Record<string, string>[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const out: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const rec: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) rec[headers[j]] = cols[j] ?? '';
    out.push(rec);
  }
  return out;
}

export function getField(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k];
    // case-insensitive fallback
    const ci = Object.keys(row).find((rk) => rk.toLowerCase() === k.toLowerCase());
    if (ci && row[ci]) return row[ci];
  }
  return '';
}
