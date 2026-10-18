import { afterEach, describe, expect, it, vi } from 'vitest';
import { newPatchworkId } from './ids';
import { makePiece, makeProject, makeShape } from './model';

afterEach(() => vi.unstubAllGlobals());

describe('拼布 ID 在局域网 HTTP 下兼容', () => {
  it('randomUUID 不可用时仍能创建项目和布片', () => {
    let counter = 0;
    vi.stubGlobal('crypto', {
      getRandomValues(bytes: Uint8Array) {
        for (let i = 0; i < bytes.length; i++) bytes[i] = (counter++ & 255);
        return bytes;
      },
    });
    const project = makeProject();
    const piece = makePiece(makeShape('rect', 20, 20, 30, 30));
    expect(project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(piece.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(piece.id).not.toBe(project.id);
  });

  it('crypto 整体不可用时仍能生成本地 ID', () => {
    vi.stubGlobal('crypto', undefined);
    expect(newPatchworkId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
