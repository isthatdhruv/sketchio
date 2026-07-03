import { describe, it, expect } from 'vitest';
import { splitScript, preprocessStatement } from './split';

describe('splitScript', () => {
  it('splits on ; outside strings/comments/backticks', () => {
    const { statements } = splitScript(
      "CREATE TABLE a (x varchar(9) DEFAULT 'a;b');\n-- a comment; with semicolon\nCREATE TABLE `b;b` (y int); # tail; comment\n/* block;\nstill block */ INSERT INTO a VALUES (';');");
    expect(statements.length).toBe(3);
    expect(statements[0].text).toContain("'a;b'");
    expect(statements[1].text).toContain('`b;b`');
    expect(statements[1].line).toBe(3);
    expect(statements[2].text.startsWith('INSERT')).toBe(true);
  });
  it('captures logical comment lines', () => {
    const { statements, logicalLines } = splitScript('CREATE TABLE a (x int);\n-- logical: {"from":"a","to":"b","cardinality":"m-1"}\n');
    expect(statements.length).toBe(1);
    expect(logicalLines.length).toBe(1);
    expect(JSON.parse(logicalLines[0].json)).toMatchObject({ from: 'a', to: 'b' });
  });
  it('handles DELIMITER blocks without splitting on inner ;', () => {
    const { statements } = splitScript(
      'DELIMITER ;;\nCREATE TRIGGER tg BEFORE INSERT ON t FOR EACH ROW BEGIN SET @x = 1; END;;\nDELIMITER ;\nCREATE TABLE t2 (a int);');
    const trigger = statements.find(s => s.text.startsWith('CREATE TRIGGER'));
    expect(trigger).toBeDefined();
    expect(trigger!.text).toContain('SET @x = 1; END');
    expect(statements.some(s => s.text.startsWith('CREATE TABLE t2'))).toBe(true);
  });
  it('escaped quotes stay inside one statement', () => {
    const { statements } = splitScript("INSERT INTO t VALUES ('it\\'s; fine');");
    expect(statements.length).toBe(1);
  });
});

describe('preprocessStatement', () => {
  it('captures and strips SRID', () => {
    const r = preprocessStatement('CREATE TABLE t (`loc` point NOT NULL SRID 4326, g geometry SRID 0)');
    expect(r.srids.get('loc')).toBe(4326);
    expect(r.srids.get('g')).toBe(0);
    expect(r.text).not.toMatch(/SRID/i);
  });
  it('expands serial and strips legacy BINARY', () => {
    const r = preprocessStatement('CREATE TABLE t (id serial, pw varchar(40) BINARY DEFAULT NULL)');
    expect(r.text).toContain('bigint unsigned NOT NULL AUTO_INCREMENT UNIQUE');
    expect(r.text).not.toMatch(/\bBINARY\b/);
    expect(r.notes.length).toBe(2);
  });
  it('does not touch varbinary/binary(n) types', () => {
    const r = preprocessStatement('CREATE TABLE t (a binary(16), b varbinary(32))');
    expect(r.text).toContain('binary(16)');
    expect(r.text).toContain('varbinary(32)');
    expect(r.notes.length).toBe(0);
  });
});
