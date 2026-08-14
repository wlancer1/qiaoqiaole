import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openSqliteDatabase } from './sqliteStore.mjs';

const tempDirs = [];

afterEach(async () => {
  while (tempDirs.length) await rm(tempDirs.pop(), { recursive: true, force: true });
});

describe('native sqlite store', () => {
  it('opens a file-backed database with WAL journaling', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-native-sqlite-'));
    tempDirs.push(directory);
    const filename = path.join(directory, 'app.sqlite');

    const db = openSqliteDatabase(filename);
    db.prepare('CREATE TABLE items (id TEXT PRIMARY KEY, value TEXT)').run();
    db.prepare('INSERT INTO items (id, value) VALUES (?, ?)').run('one', 'persisted');
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    db.close();

    const reopened = openSqliteDatabase(filename);
    expect(reopened.prepare('SELECT value FROM items WHERE id = ?').get('one').value).toBe('persisted');
    reopened.close();
  });
});
