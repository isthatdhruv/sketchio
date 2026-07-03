export interface RawStatement { text: string; line: number }
export interface LogicalComment { line: number; json: string }

export function splitScript(sql: string): { statements: RawStatement[]; logicalLines: LogicalComment[] } {
  const statements: RawStatement[] = [];
  const logicalLines: LogicalComment[] = [];
  let buf = '', bufStartLine = 1, line = 1, i = 0, delimiter = ';';
  type Mode = 'code' | 'sq' | 'dq' | 'bt' | 'line-comment' | 'block-comment';
  let mode: Mode = 'code';
  let commentBuf = '';

  const flush = () => {
    const text = buf.trim();
    if (text) statements.push({ text, line: bufStartLine });
    buf = '';
  };
  const captureLogical = (atLine: number) => {
    const m = commentBuf.match(/^--\s*logical:\s*(\{.*\})\s*$/);
    if (m) logicalLines.push({ line: atLine, json: m[1] });
    commentBuf = '';
  };
  const atLineStart = () => /(^|\n)[ \t]*$/.test(buf);

  while (i < sql.length) {
    const ch = sql[i], next = sql[i + 1];
    if (ch === '\n') line++;
    switch (mode) {
      case 'sq': case 'dq': {
        buf += ch;
        const q = mode === 'sq' ? "'" : '"';
        if (ch === '\\' && next != null) { buf += next; if (next === '\n') line++; i += 2; continue; }
        if (ch === q) { if (next === q) { buf += next; i += 2; continue; } mode = 'code'; }
        i++; continue;
      }
      case 'bt': { buf += ch; if (ch === '`') mode = 'code'; i++; continue; }
      case 'line-comment': {
        if (ch === '\n') { captureLogical(line - 1); mode = 'code'; buf += '\n'; }
        else commentBuf += ch;
        i++; continue;
      }
      case 'block-comment': {
        if (ch === '*' && next === '/') { mode = 'code'; i += 2; continue; }
        i++; continue;
      }
      case 'code': {
        if (ch === "'") { mode = 'sq'; if (!buf.trim()) bufStartLine = line; buf += ch; i++; continue; }
        if (ch === '"') { mode = 'dq'; buf += ch; i++; continue; }
        if (ch === '`') { mode = 'bt'; buf += ch; i++; continue; }
        if (ch === '#') { mode = 'line-comment'; commentBuf = '#'; i++; continue; }
        if (ch === '-' && next === '-' && (sql[i + 2] === ' ' || sql[i + 2] === '\t' || sql[i + 2] === '\n' || sql[i + 2] == null)) {
          mode = 'line-comment'; commentBuf = '--'; i += 2; continue;
        }
        if (ch === '/' && next === '*') { mode = 'block-comment'; i += 2; continue; }
        if (atLineStart()) {
          const nl = sql.indexOf('\n', i);
          const rest = sql.slice(i, nl === -1 ? sql.length : nl);
          const dm = rest.match(/^DELIMITER\s+(\S+)/i);
          if (dm) { flush(); delimiter = dm[1] === ';' ? ';' : dm[1]; i += dm[0].length; continue; }
        }
        if (sql.startsWith(delimiter, i)) {
          flush(); i += delimiter.length; bufStartLine = line; continue;
        }
        if (!buf.trim() && !/\s/.test(ch)) bufStartLine = line;
        buf += ch; i++; continue;
      }
    }
  }
  if (mode === 'line-comment') captureLogical(line);
  flush();
  return { statements, logicalLines };
}

export interface PreprocessResult { text: string; srids: Map<string, number>; notes: string[] }

const SPATIAL_RE = 'geometry|point|linestring|polygon|multipoint|multilinestring|multipolygon|geometrycollection';

export function preprocessStatement(text: string): PreprocessResult {
  const srids = new Map<string, number>();
  const notes: string[] = [];
  let out = text.replace(
    new RegExp('`?(\\w+)`?\\s+((?:' + SPATIAL_RE + ')\\b[^,]*?)\\s+SRID\\s+(\\d+)', 'gis'),
    (_m, col: string, mid: string, srid: string) => { srids.set(col, Number(srid)); return `\`${col}\` ${mid}`; },
  );
  if (/\bserial\b/i.test(out)) {
    out = out.replace(/\bserial\b/gi, 'bigint unsigned NOT NULL AUTO_INCREMENT UNIQUE');
    notes.push('serial expanded to bigint unsigned NOT NULL AUTO_INCREMENT UNIQUE');
  }
  const legacyBinary = new RegExp('((?:var)?char\\s*\\(\\s*\\d+\\s*\\)|(?:tiny|medium|long)?text\\b)\\s+BINARY\\b', 'gi');
  if (legacyBinary.test(out)) {
    legacyBinary.lastIndex = 0;
    out = out.replace(legacyBinary, '$1');
    notes.push('legacy BINARY attribute removed (use a _bin collation instead)');
  }
  return { text: out, srids, notes };
}
