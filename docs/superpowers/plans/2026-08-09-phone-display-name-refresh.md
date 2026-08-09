# Phone Display Name Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep phone accounts' internal `phone_<hash>` usernames out of the visible H5 account name after a session reload.

**Architecture:** Add one pure session-display-name resolver in the H5 utilities and make the existing `H5App.tsx` restoration effect call it. The resolver treats API and local-storage strings as untrusted candidates, trims them, filters generated phone identifiers, and preserves legacy username fallback behavior.

**Tech Stack:** TypeScript, React 19, Vitest 3, Vite 7

---

## Chunk 1: Regression and Minimal Fix

### Task 1: Define the session display-name contract

**Files:**
- Create: `apps/h5/src/utils/authDisplayName.test.ts`
- Create: `apps/h5/src/utils/authDisplayName.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/h5/src/utils/authDisplayName.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveRestoredDisplayName } from './authDisplayName';

describe('restored authentication display name', () => {
  it('prefers a public nickname over a generated phone username', () => {
    expect(resolveRestoredDisplayName(
      { username: 'phone_0123456789abcdef', nickname: ' 用户8000 ' },
      '本地昵称',
    )).toBe('用户8000');
  });

  it('keeps legacy username fallback when no nickname exists', () => {
    expect(resolveRestoredDisplayName({ username: ' legacy-user ', nickname: '' }, '')).toBe('legacy-user');
  });

  it('uses the stored display name when server candidates are blank', () => {
    expect(resolveRestoredDisplayName({ username: ' ', nickname: '\n' }, ' 本地昵称 ')).toBe('本地昵称');
  });

  it('rejects generated phone identifiers from every candidate', () => {
    expect(resolveRestoredDisplayName(
      { username: 'phone_0123456789abcdef', nickname: ' phone_legacy ' },
      'phone_cached',
    )).toBe('我的创作');
  });

  it('uses a neutral fallback when all candidates are exhausted', () => {
    expect(resolveRestoredDisplayName({}, '')).toBe('我的创作');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run --config vitest.config.ts apps/h5/src/utils/authDisplayName.test.ts
```

Expected: FAIL because `./authDisplayName` does not exist.

- [ ] **Step 3: Implement the minimal pure resolver**

Create `apps/h5/src/utils/authDisplayName.ts`:

```ts
type RestoredUser = {
  nickname?: unknown;
  username?: unknown;
};

function safeDisplayName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const candidate = value.trim();
  return candidate && !candidate.startsWith('phone_') ? candidate : '';
}

export function resolveRestoredDisplayName(user: RestoredUser, storedDisplayName: unknown): string {
  return safeDisplayName(user?.nickname)
    || safeDisplayName(user?.username)
    || safeDisplayName(storedDisplayName)
    || '我的创作';
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run --config vitest.config.ts apps/h5/src/utils/authDisplayName.test.ts
```

Expected: 1 test file and 5 tests pass.

### Task 2: Wire the resolver into H5 session restoration

**Files:**
- Modify: `apps/h5/src/H5App.tsx` near utility imports and the `restoreSession` effect
- Test: `apps/h5/src/utils/authDisplayName.test.ts`

- [ ] **Step 1: Import the resolver**

Add this import beside the other `./utils/` imports:

```ts
import { resolveRestoredDisplayName } from './utils/authDisplayName';
```

- [ ] **Step 2: Replace the unsafe username-first selection**

Change only the display-name assignment inside `restoreSession`:

```ts
setLoginName(resolveRestoredDisplayName(payload.user || {}, stored.username));
```

Keep token validation, login state, data loading, and expired-session cleanup unchanged.

- [ ] **Step 3: Run focused and adjacent H5 unit tests**

Run:

```bash
npx vitest run --config vitest.config.ts apps/h5/src/utils/authDisplayName.test.ts apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx
```

Expected: both test files pass.

- [ ] **Step 4: Run H5 build verification**

Run:

```bash
npm run build:h5
```

Expected: TypeScript checking and Vite H5 build complete successfully.

- [ ] **Step 5: Review the exact diff without staging unrelated work**

Run:

```bash
git diff --check
git diff -- apps/h5/src/utils/authDisplayName.ts apps/h5/src/utils/authDisplayName.test.ts apps/h5/src/H5App.tsx
```

Because `apps/h5/src/H5App.tsx` already contains unrelated user-owned working-tree edits and the user did not request a code commit, leave the implementation changes unstaged. Do not revert, rewrite, or accidentally include the existing edits in a commit.
