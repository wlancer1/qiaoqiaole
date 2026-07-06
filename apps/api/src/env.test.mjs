import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadEnvFile } from './env.mjs';

describe('env file loading', () => {
  test('loads XHS_COOKIE from a dotenv-style file', () => {
    const previous = process.env.XHS_COOKIE;
    delete process.env.XHS_COOKIE;
    const dir = mkdtempSync(path.join(tmpdir(), 'qiaoqiaole-env-'));
    const file = path.join(dir, '.env');
    writeFileSync(file, 'XHS_COOKIE="web_session=abc; a1=def"\n');

    try {
      loadEnvFile(file);
      expect(process.env.XHS_COOKIE).toBe('web_session=abc; a1=def');
    } finally {
      if (previous === undefined) delete process.env.XHS_COOKIE;
      else process.env.XHS_COOKIE = previous;
    }
  });
});
