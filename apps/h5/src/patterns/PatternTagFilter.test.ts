import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PatternTagFilter', () => {
  it('uses the documented compact tag scale and the pattern-list color family', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const filter = styles.match(/\.pattern-tag-filter\s*\{([^}]*)\}/)?.[1] ?? '';
    const button = [...styles.matchAll(/\.pattern-tag-filter button\s*\{([^}]*)\}/g)].at(-1)?.[1] ?? '';
    const activeButton = styles.match(/\.pattern-tag-filter button\.active\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(filter).toContain('gap: .2222rem');
    expect(filter).toContain('padding-bottom: .127rem');
    expect(button).toContain('min-height: 1.016rem');
    expect(button).toContain('background: #fff');
    expect(button).toContain('color: #617a9e');
    expect(activeButton).toContain('background: #146cff');
    expect(activeButton).toContain('color: #fff');
  });
});
