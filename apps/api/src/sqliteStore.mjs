import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function openSqliteDatabase(filename) {
  mkdirSync(path.dirname(filename), { recursive: true });
  const database = new Database(filename);
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = NORMAL');
  database.pragma('foreign_keys = ON');

  return {
    pragma: (statement, options) => database.pragma(statement, options),
    prepare: (sql) => database.prepare(sql),
    run: (sql, params = []) => {
      if (params.length === 0 && String(sql).includes(';')) return database.exec(sql);
      return database.prepare(sql).run(...params);
    },
    exec: (sql) => database.exec(sql),
    close: () => database.close(),
  };
}
