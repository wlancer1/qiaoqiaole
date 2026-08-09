import { describe, expect, it } from 'vitest';
import { resolveRestoredDisplayName } from './authDisplayName';

describe('resolveRestoredDisplayName', () => {
  it('prefers a trimmed nickname over an internal phone username', () => {
    expect(resolveRestoredDisplayName({
      nickname: ' 用户8000 ',
      username: 'phone_0123456789abcdef',
    }, undefined)).toBe('用户8000');
  });

  it('falls back from a blank nickname to a trimmed legacy username', () => {
    expect(resolveRestoredDisplayName({
      nickname: '   ',
      username: ' legacy-user ',
    }, undefined)).toBe('legacy-user');
  });

  it('falls back from blank server fields to a trimmed stored display name', () => {
    expect(resolveRestoredDisplayName({
      nickname: ' ',
      username: '\n',
    }, ' 本地用户 ')).toBe('本地用户');
  });

  it.each([
    {
      source: 'nickname',
      user: { nickname: 'phone_nickname', username: 'legacy-user' },
      storedDisplayName: 'stored-user',
      expected: 'legacy-user',
    },
    {
      source: 'username',
      user: { nickname: '', username: 'phone_username' },
      storedDisplayName: 'stored-user',
      expected: 'stored-user',
    },
    {
      source: 'stored display name',
      user: { nickname: '', username: '' },
      storedDisplayName: 'phone_stored',
      expected: '我的创作',
    },
  ])('rejects an internal phone identifier from $source', ({ user, storedDisplayName, expected }) => {
    expect(resolveRestoredDisplayName(user, storedDisplayName)).toBe(expected);
  });

  it('returns the safe default when every candidate is exhausted', () => {
    expect(resolveRestoredDisplayName({
      nickname: null,
      username: 8000,
    }, undefined)).toBe('我的创作');
  });
});
