# Comment Default Avatar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display each comment author's configured avatar when available and a consistent user-outline icon when it is missing or fails to load.

**Architecture:** Extend the existing community-comment API view with a normalized `authorAvatar: string | null` field in both list and create responses. Render that field through a focused stateful H5 `CommentAvatar` component that owns image-error fallback, while `PatternDetailPage` remains responsible only for comment layout.

**Tech Stack:** Node.js HTTP API, SQL.js, React 19, TypeScript, Vitest, Playwright, Lucide React, CSS.

**Spec:** `docs/superpowers/specs/2026-08-09-comment-default-avatar-design.md`

---

## File Map

- Create `apps/h5/src/patterns/CommentAvatar.tsx`: render a configured image and isolate per-comment image-error fallback state.
- Create `apps/h5/src/patterns/CommentAvatar.test.tsx`: cover static image/default-icon rendering and accessible markup.
- Modify `apps/h5/src/patterns/H5PatternPages.tsx`: replace nickname-initial comment avatars with `CommentAvatar`.
- Modify `apps/h5/src/community/communityData.ts`: make `authorAvatar` part of the comment response contract.
- Modify `apps/h5/src/styles.css`: style the real image and default icon within the existing avatar dimensions.
- Modify `apps/h5/src/patterns/H5PatternPages.test.ts`: prove the detail page passes both avatar states into rendered comment markup.
- Modify `apps/api/src/server.mjs`: select and normalize `users.avatar_url` in both comment response paths.
- Modify `apps/api/src/community.test.mjs`: prove ordinary users receive an explicit `authorAvatar: null`.
- Create `apps/api/src/commentAvatar.integration.test.mjs`: prove a persisted non-empty avatar is returned consistently by create and list responses and whitespace is normalized to `null` after a controlled server restart.
- Modify `tests/e2e/h5.spec.ts`: trigger a real image load failure and prove fallback state is isolated to one comment.

## Chunk 1: API Response Contract

### Task 1: Add failing API tests for missing and configured avatars

**Files:**
- Modify: `apps/api/src/community.test.mjs`
- Create: `apps/api/src/commentAvatar.integration.test.mjs`
- Test: `apps/api/src/community.test.mjs`
- Test: `apps/api/src/commentAvatar.integration.test.mjs`

- [ ] **Step 1: Assert the existing no-avatar response has an explicit null field**

In the existing comment persistence test, add assertions for both response paths:

```js
expect(comment.body.comment).toHaveProperty('authorAvatar', null);

const comments = await request(`/api/community/posts/${projectId}/comments`);
expect(comments.body.comments.find((item) => item.id === comment.body.comment.id))
  .toHaveProperty('authorAvatar', null);
```

- [ ] **Step 2: Write an isolated configured-avatar integration test**

Create a test that uses a temporary database and explicit process lifecycle helpers. `startServer()` must spawn the API, poll `/api/health` for at most 50 attempts, return only after a 200 response, and throw if readiness is never reached. `stopServer()` must send `SIGTERM` and await the child `exit` event before resolving:

```js
async function startServer() {
  serverProcess = spawn(process.execPath, ['src/server.mjs'], { /* isolated env and dbPath */ });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await request('/api/health')).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('comment avatar API did not become ready');
}

async function stopServer() {
  const child = serverProcess;
  if (!child) return;
  serverProcess = undefined;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
}
```

Bootstrap the schema and admin user by starting the server and completing a successful login, then call `stopServer()` before opening `dbPath`. For each fixture update, read the database, execute the SQL update, call `writeFile(dbPath, Buffer.from(db.export()))`, and only then call `db.close()`. Restart the API and log in again before creating/sharing/commenting on a project. Never read or overwrite the database while the API process is running.

Assert the configured value is identical in both paths:

```js
expect(created.body.comment.authorAvatar).toBe('https://cdn.example.com/avatar.png');
expect(listed.body.comments.find((item) => item.id === created.body.comment.id)?.authorAvatar)
  .toBe('https://cdn.example.com/avatar.png');
```

Then cover both stored empty forms in sequence:

1. Stop the API, set `avatar_url` to `''`, close/write the database, restart, log in again, create a second comment, and assert both the create response and list entry contain `authorAvatar: null`.
2. Stop the API, set `avatar_url` to `'   '`, close/write the database, restart, log in again, create a third comment, and assert both the create response and list entry contain `authorAvatar: null`.
3. In the final list response, also assert the first existing comment now has `authorAvatar: null`, proving list reads the current user avatar rather than a creation-time snapshot.

Keep all restart-dependent assertions in one test so no test-order or concurrent-server assumption leaks between cases. In `afterAll`, use `try { await stopServer(); } finally { await rm(root, { recursive: true, force: true }); }` so cleanup is explicit even after a failure.

- [ ] **Step 3: Run the API tests and verify RED**

Run:

```bash
npx vitest run --config vitest.config.ts apps/api/src/community.test.mjs apps/api/src/commentAvatar.integration.test.mjs
```

Expected: the existing suite FAILS because `authorAvatar` is missing; the isolated integration test FAILS because the configured value is missing and/or empty values are not normalized. Fixture readiness or address-in-use errors are test setup errors and must be corrected before proceeding.

### Task 2: Implement the normalized API field

**Files:**
- Modify: `apps/api/src/server.mjs`
- Test: `apps/api/src/community.test.mjs`
- Test: `apps/api/src/commentAvatar.integration.test.mjs`

- [ ] **Step 1: Add one normalization helper beside `safeDisplayName`**

```js
function safeAvatarUrl(value) {
  return String(value || '').trim() || null;
}
```

- [ ] **Step 2: Return the field from the list query**

Select `u.avatar_url AS authorAvatar` in `listProjectComments`, then map query rows before sending them so every row contains the normalized field:

```js
const comments = getAll(/* existing query with u.avatar_url AS authorAvatar */)
  .map((comment) => ({ ...comment, authorAvatar: safeAvatarUrl(comment.authorAvatar) }));
```

- [ ] **Step 3: Return the same field from comment creation**

Select `u.avatar_url AS avatarUrl` in `createProjectComment` and add the field to the response object:

```js
const comment = {
  id: randomUUID(),
  projectId,
  authorId: userId,
  author: safeDisplayName(author),
  authorAvatar: safeAvatarUrl(author?.avatarUrl),
  content,
  createdAt: new Date().toISOString(),
};
```

- [ ] **Step 4: Run the focused API tests and verify GREEN**

Run:

```bash
npx vitest run --config vitest.config.ts apps/api/src/community.test.mjs apps/api/src/commentAvatar.integration.test.mjs
```

Expected: both files PASS with no warnings or leaked server processes.

- [ ] **Step 5: Commit the API contract**

```bash
git add apps/api/src/server.mjs apps/api/src/community.test.mjs apps/api/src/commentAvatar.integration.test.mjs
git commit -m "fix(api): include comment author avatars"
```

## Chunk 2: H5 Avatar Rendering

### Task 3: Add failing component tests for real and default avatars

**Files:**
- Create: `apps/h5/src/patterns/CommentAvatar.test.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.test.ts`
- Modify: `apps/h5/src/community/communityData.ts`
- Modify/Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Update the TypeScript response contract**

Add the required server field:

```ts
export type CommunityComment = {
  // existing fields
  authorAvatar: string | null;
};
```

Update existing comment fixtures to include `authorAvatar: null` so the compile-time contract stays explicit.

- [ ] **Step 2: Write static rendering tests for the focused component**

Test the wished-for `CommentAvatar` API with `renderToStaticMarkup`:

```tsx
expect(renderToStaticMarkup(<CommentAvatar avatarUrl={null} />))
  .toContain('data-comment-avatar-fallback="true"');

const imageMarkup = renderToStaticMarkup(
  <CommentAvatar avatarUrl="https://cdn.example.com/avatar.png" />,
);
expect(imageMarkup).toContain('src="https://cdn.example.com/avatar.png"');
expect(imageMarkup).toContain('alt=""');
```

Add separate assertions that `avatarUrl=""` and `avatarUrl="   "` both render `data-comment-avatar-fallback="true"` and do not render `<img>`. Assert the fallback SVG contains `aria-hidden="true"`, and that fallback markup contains no text node.

- [ ] **Step 3: Add a detail-page integration assertion**

Render `PatternDetailPage` with one configured-avatar comment and one null-avatar comment. Assert one `.detail-comment-avatar-image` source and one `data-comment-avatar-fallback="true"` marker appear, proving the page wires API data into the focused component.

In the existing CSS contract test, read the wished-for `.detail-comment-avatar` and `.detail-comment-avatar-image` rules. Assert the container retains `width: 0.635rem`, `height: 0.635rem`, and adds `overflow: hidden`; assert the image rule contains `object-fit: cover`.

- [ ] **Step 4: Write the route-controlled Playwright regression before implementation**

Before `page.goto('/')`, intercept `**/api/community/posts?*` and return a single complete post:

```ts
{
  posts: [{
    id: 'avatar-post', name: '头像回退稿件', author: '作者', authorId: 'author-1',
    rows: 2, cols: 2, tone: 'recent-flower',
    thumbnailImage: validPngDataUrl, sourceImage: validPngDataUrl,
    beadList: [], likesCount: 0, commentsCount: 2, likedByMe: false,
    sharedAt: '2026-08-09T00:00:00.000Z',
  }],
}
```

Intercept `**/api/community/posts/avatar-post/comments*` and return:

```ts
{
  comments: [
    { id: 'broken', projectId: 'avatar-post', authorId: 'user-1', author: '破图用户', authorAvatar: 'https://avatar.invalid/broken.png', content: '破图评论', createdAt: '2026-08-09T01:00:00.000Z' },
    { id: 'valid', projectId: 'avatar-post', authorId: 'user-2', author: '正常用户', authorAvatar: validPngDataUrl, content: '正常评论', createdAt: '2026-08-09T02:00:00.000Z' },
  ],
}
```

Register `page.route('https://avatar.invalid/**', (route) => route.abort())` before navigation. Use this valid inline 1×1 PNG so the test has no filesystem or external network dependency:

```ts
const validPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
```

Navigate with exact waits:

```ts
await page.goto('/');
await page.getByRole('button', { name: '发现', exact: true }).click();
const card = page.locator('.pattern-card', { hasText: '头像回退稿件' });
await expect(card).toBeVisible();
await card.click();
await expect(page.locator('main[aria-label="图纸详情页"]')).toBeVisible();
await expect(page.locator('.detail-comment')).toHaveCount(2);
```

Assert the broken row has one fallback marker and the valid row retains one image. For the valid image, use `evaluate` to assert `complete === true && naturalWidth > 0`.

- [ ] **Step 5: Run the component and browser tests and verify RED**

Run:

```bash
npx vitest run --config vitest.config.ts apps/h5/src/patterns/CommentAvatar.test.tsx apps/h5/src/patterns/H5PatternPages.test.ts
npx playwright test tests/e2e/h5.spec.ts --project=h5-chromium --grep "falls back per comment when an avatar image fails"
```

Expected: Vitest FAILS because `CommentAvatar` does not exist, the detail page still renders nickname initials, and the CSS contract lacks crop rules. Playwright must successfully reach the detail page and render two comments, then FAIL specifically because the broken row's fallback count is 0; fixture, navigation, or successful-image load errors must be fixed before implementation.

### Task 4: Implement the image/default-icon component and styles

**Files:**
- Create: `apps/h5/src/patterns/CommentAvatar.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx`
- Modify: `apps/h5/src/styles.css`
- Test: `apps/h5/src/patterns/CommentAvatar.test.tsx`
- Test: `apps/h5/src/patterns/H5PatternPages.test.ts`

- [ ] **Step 1: Implement image-error state scoped by normalized URL**

Use the project icon set through Lucide's `UserRound`. Scope the failed state by normalized URL:

```tsx
import { UserRound } from 'lucide-react';
import { useState } from 'react';

export function CommentAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  const normalizedUrl = avatarUrl?.trim() || '';
  const [failedUrl, setFailedUrl] = useState('');
  const showImage = Boolean(normalizedUrl) && failedUrl !== normalizedUrl;

  return (
    <span className="detail-comment-avatar">
      {showImage ? (
        <img
          className="detail-comment-avatar-image"
          src={normalizedUrl}
          alt=""
          onError={() => setFailedUrl(normalizedUrl)}
        />
      ) : (
        <UserRound data-comment-avatar-fallback="true" aria-hidden="true" />
      )}
    </span>
  );
}
```

The failed URL value scopes the error to this component instance while allowing a different `avatarUrl` received by the same instance to render immediately. Do not accept unused author data; the adjacent author name already provides the accessible label.

- [ ] **Step 2: Wire the component into comment rows**

Replace:

```tsx
<span className="detail-comment-avatar">{comment.author[0]}</span>
```

with:

```tsx
<CommentAvatar avatarUrl={comment.authorAvatar} />
```

- [ ] **Step 3: Style both states within the existing circle**

Give `.detail-comment-avatar` a stable light neutral background and foreground color plus `overflow: hidden`. Give `.detail-comment-avatar-image` `width: 100%`, `height: 100%`, `display: block`, and `object-fit: cover`; size the fallback SVG without changing the existing `0.635rem` layout box.

- [ ] **Step 4: Run the focused component tests and verify GREEN**

Run:

```bash
npx vitest run --config vitest.config.ts apps/h5/src/patterns/CommentAvatar.test.tsx apps/h5/src/patterns/H5PatternPages.test.ts
```

Expected: both files PASS, with no author initial rendered as the fallback.

- [ ] **Step 5: Commit the H5 component**

```bash
git add apps/h5/src/community/communityData.ts apps/h5/src/patterns/CommentAvatar.tsx apps/h5/src/patterns/CommentAvatar.test.tsx apps/h5/src/patterns/H5PatternPages.tsx apps/h5/src/patterns/H5PatternPages.test.ts apps/h5/src/styles.css
git commit -m "fix(h5): show fallback icons for comment avatars"
```

## Chunk 3: Browser Regression and Final Verification

### Task 5: Verify and commit the browser regression

**Files:**
- Test/Commit existing change: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Run the prewritten test against the completed component**

The test written before Task 4 asserts the final per-row state:

```ts
const comments = page.locator('.detail-comment');
await expect(comments).toHaveCount(2);
await expect(comments.filter({ hasText: '破图用户' }).locator('[data-comment-avatar-fallback="true"]')).toHaveCount(1);
await expect(comments.filter({ hasText: '正常用户' }).locator('.detail-comment-avatar-image')).toHaveCount(1);
```

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts --project=h5-chromium --grep "falls back per comment when an avatar image fails"
```

Expected GREEN: the broken row has exactly one fallback icon and the successful row retains exactly one image whose `complete` is true and `naturalWidth` is greater than zero.

- [ ] **Step 2: Commit the browser regression**

```bash
git add tests/e2e/h5.spec.ts
git commit -m "test(h5): cover comment avatar load fallback"
```

### Task 6: Verify the complete change

**Files:**
- Verify only; do not modify unrelated files.

- [ ] **Step 1: Run all directly related tests**

```bash
npx vitest run --config vitest.config.ts apps/api/src/community.test.mjs apps/api/src/commentAvatar.integration.test.mjs apps/h5/src/patterns/CommentAvatar.test.tsx apps/h5/src/patterns/H5PatternPages.test.ts
npx playwright test tests/e2e/h5.spec.ts --project=h5-chromium --grep "falls back per comment when an avatar image fails"
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run repository-level verification**

```bash
npm test
npm run build:h5
git diff --check HEAD~3..HEAD
```

Expected: test suite and H5 build PASS; diff check prints nothing.

- [ ] **Step 3: Inspect scope and working tree**

```bash
git status --short
git diff --stat HEAD~3..HEAD
```

Expected: only the planned avatar files appear in the implementation commits. Pre-existing unrelated working-tree changes remain uncommitted and untouched.
