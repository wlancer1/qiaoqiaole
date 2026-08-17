# Home Thumbnail Loading Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make home recent-project thumbnails settle quickly, defer popular artwork until it approaches the viewport, and make popular infinite loading single-flight and sort-safe.

**Architecture:** `HomeShellPage` owns page-level image priority, while `ImageWithSkeleton` owns visibility activation and terminal loading state. `useCommunityDomain` owns the current list sort context and a synchronous load-more lock; `useCommunityHomeAdapter` explicitly requests the hot feed. The repository instruction to stay in the current worktree overrides the generic worktree recommendation.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, react-test-renderer, Vite

---

## File Structure

- `apps/h5/src/shared/ImageWithSkeleton.tsx`: add visibility-gated image activation, request priority, and terminal failure protection.
- `apps/h5/src/shared/ImageWithSkeleton.test.tsx`: behavior tests for visibility, timeout, fallback environments, and stale events.
- `apps/h5/src/community/CommunityPatternCard.tsx`: pass list-specific loading controls to the shared image component.
- `apps/h5/src/community/homeTemplateImageLoading.test.tsx`: verify the card forwards the public image-loading contract.
- `apps/h5/src/pages/home/HomeShellPage.tsx`: select recent-project and popular-artwork policies.
- `apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx`: verify the home page assigns those policies.
- `apps/h5/src/features/community/useCommunityDomain.ts`: add sort-bound pagination context and a synchronous single-flight guard.
- `apps/h5/src/features/community/useCommunityDomain.test.tsx`: cover duplicate triggers, lock release, and sort mismatch.
- `apps/h5/src/features/community/useCommunityHomeAdapter.ts`: request `hot` explicitly from the home sentinel.
- `apps/h5/src/features/community/useCommunityHomeAdapter.test.tsx`: verify the home adapter's sort contract.

## Preparation: Capture the Implementation Baseline

- [ ] **Step 1: Record the exact baseline before any RED test edits**

Immediately after committing this plan, run:

```bash
git rev-parse HEAD
git status --short
git diff
```

Record the returned commit as an immutable literal `BASE_SHA` in the execution notes, together with the complete initial status and patch. Preserve any pre-existing user changes, including changes that overlap an allowlisted file. Every later range command must substitute the recorded literal SHA directly; do not rely on a shell variable persisting between tool calls.

## Chunk 1: Image Loading Behavior

### Task 1: Visibility-gated shared image

**Files:**
- Modify: `apps/h5/src/shared/ImageWithSkeleton.test.tsx`
- Modify: `apps/h5/src/shared/ImageWithSkeleton.tsx`

- [ ] **Step 1: Write failing visibility and terminal-state tests**

Add tests that stub `IntersectionObserver`, capture its callback, and assert:

```tsx
renderer = create(
  <ImageWithSkeleton
    src="/popular.webp"
    alt=""
    loading="lazy"
    fetchPriority="low"
    deferUntilVisible
    loadTimeoutMs={2_500}
    maxRetries={0}
    fallback={<span data-fallback="true">暂无预览图</span>}
  />,
);

expect(renderer.root.findAllByType('img')).toHaveLength(0);
vi.advanceTimersByTime(2_500);
expect(renderer.root.findAllByProps({ 'data-fallback': 'true' })).toHaveLength(0);

observerCallback([{ isIntersecting: true }]);
expect(renderer.root.findByType('img').props.fetchPriority).toBe('low');
vi.advanceTimersByTime(2_500);
expect(renderer.root.findByProps({ 'data-fallback': 'true' })).toBeTruthy();
expect(disconnect).toHaveBeenCalled();
```

Also add focused tests proving:

- unmounting a still-waiting deferred image disconnects its observer;
- without `IntersectionObserver`, a deferred native-lazy image mounts but does not time out, `onLoad` displays it, and a separate `onError` case displays fallback once without retry;
- after a terminal timeout, invoking the captured stale `onLoad` handler does not revive the image;
- changing `src` clears the old timer and observer, resets terminal failure, and establishes a fresh waiting state.

Wrap observer callbacks, timer advancement, renderer updates, and unmounts in React `act(...)`.

- [ ] **Step 2: Run the shared image tests and verify RED**

Run:

```bash
npm exec vitest run -- apps/h5/src/shared/ImageWithSkeleton.test.tsx
```

Expected: FAIL because `fetchPriority` and `deferUntilVisible` do not exist and deferred images mount immediately.

- [ ] **Step 3: Implement the minimal visibility state machine**

Extend the props with:

```ts
fetchPriority?: 'high' | 'low' | 'auto';
deferUntilVisible?: boolean;
```

Use an activation state with three meaningful paths:

- immediate: normal images mount now and existing timeout behavior is unchanged;
- waiting/observed: deferred images do not mount until an observer with `rootMargin: '0px 0px 240px 0px'` intersects, then timeout begins;
- fallback: when `IntersectionObserver` is unavailable, mount the native lazy image but do not run the component timeout.

Store terminal failure in a ref. Reset it when `src` changes, set it on final `error` or timeout, and ignore stale `onLoad` callbacks while terminal. Disconnect the observer on activation and cleanup. Render the dynamic `div`/`span` wrapper with the appropriate typed ref.

- [ ] **Step 4: Run the shared image tests and verify GREEN**

Run the same Vitest command. Expected: all `ImageWithSkeleton` tests PASS.

- [ ] **Step 5: Commit the shared image behavior**

```bash
git add apps/h5/src/shared/ImageWithSkeleton.tsx apps/h5/src/shared/ImageWithSkeleton.test.tsx
git commit -m "fix(h5): bound list thumbnail skeleton time"
```

### Task 2: Home image policy and card forwarding

**Files:**
- Modify: `apps/h5/src/community/homeTemplateImageLoading.test.tsx`
- Modify: `apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx`
- Modify: `apps/h5/src/community/CommunityPatternCard.tsx`
- Modify: `apps/h5/src/pages/home/HomeShellPage.tsx`

- [ ] **Step 1: Write failing card and home policy tests**

In the community card test, mock `ImageWithSkeleton` with a probe component that records the received props, then render `CommunityPatternCard` with `loading="lazy"`, `fetchPriority="low"`, `deferUntilVisible`, `loadTimeoutMs={2500}`, and `maxRetries={0}`. Assert the probe receives all five policy values. Retry state behavior remains covered by the real `ImageWithSkeleton` tests in Task 1; this test covers only the card boundary.

In the home test, inspect the returned React tree:

```ts
const recentImage = collectElements(shell).find((element) => element.type === ImageWithSkeleton);
expect(recentImage?.props).toMatchObject({
  loading: 'eager',
  fetchPriority: 'high',
  loadTimeoutMs: 2_500,
  maxRetries: 0,
});

const popularCard = collectElements(shell).find((element) => element.type === CommunityPatternCard);
expect(popularCard?.props).toMatchObject({
  loading: 'lazy',
  fetchPriority: 'low',
  deferUntilVisible: true,
  loadTimeoutMs: 2_500,
  maxRetries: 0,
});
```

- [ ] **Step 2: Run the card and home tests and verify RED**

```bash
npm exec vitest run -- apps/h5/src/community/homeTemplateImageLoading.test.tsx apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx
```

Expected: FAIL because the components do not expose or assign the new policy props.

- [ ] **Step 3: Implement card forwarding and home policies**

Keep the existing `loading` and `loadTimeoutMs` props, add `fetchPriority`, `deferUntilVisible`, and `maxRetries` to `CommunityPatternCardProps`, and pass all five policy props unchanged to `ImageWithSkeleton`. Set recent projects to:

```tsx
loading="eager"
fetchPriority="high"
loadTimeoutMs={2_500}
maxRetries={0}
```

Set popular cards to:

```tsx
loading="lazy"
fetchPriority="low"
deferUntilVisible
loadTimeoutMs={2_500}
maxRetries={0}
```

- [ ] **Step 4: Run the card and home tests and verify GREEN**

Run the same two-file Vitest command. Expected: both files PASS.

- [ ] **Step 5: Commit the home image policy**

```bash
git add apps/h5/src/community/CommunityPatternCard.tsx apps/h5/src/community/homeTemplateImageLoading.test.tsx apps/h5/src/pages/home/HomeShellPage.tsx apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx
git commit -m "fix(h5): prioritize recent project thumbnails"
```

## Chunk 2: Sort-safe Single-flight Pagination

### Task 3: Community domain pagination guard

**Files:**
- Modify: `apps/h5/src/features/community/useCommunityDomain.test.tsx`
- Modify: `apps/h5/src/features/community/useCommunityDomain.ts`

- [ ] **Step 1: Write failing pagination behavior tests**

Add tests for these behaviors:

```ts
// First page establishes the hot list context.
await harness.control.current!.loadCommunityPosts('hot');

// Two triggers before page two settles share one request.
const firstMore = harness.control.current!.loadMoreCommunityPosts('hot');
const duplicateMore = harness.control.current!.loadMoreCommunityPosts('hot');
expect(requestApi).toHaveBeenCalledTimes(2); // page 1 + one page 2

// A different sort cannot append to the current list.
await harness.control.current!.loadMoreCommunityPosts('latest');
expect(requestApi).not.toHaveBeenCalledWith(expect.stringContaining('sort=latest&page=2'), expect.anything(), expect.anything());
```

Use a deferred page-two response to keep the first call in flight, wrap invocation and settlement in `act(...)`, and await both returned promises. Test sort mismatch in a separate case after the current request has settled, so it cannot pass merely because the single-flight lock is occupied.

Add separate regression cases proving:

- while an old hot page-two append is pending, starting a non-append latest request synchronously invalidates the hot append context; the latest response wins and the old page-two response cannot cancel or append into it;
- after latest page one succeeds, latest page two can start even while the invalidated hot append is still unresolved;
- when page two rejects, the existing list and `hasMore` remain intact and the next page-two attempt is allowed;
- logout while page two is pending clears the current lock for a new session, and the old request's `finally` cannot release or overwrite the new session's lock.
- a preserved non-append refresh failure restores the last committed sort, page, and `hasMore`; the next append requests the correct next page.

Every fixture that expects another page must return exactly 12 first-page posts. Assert the exact request URLs and final posts, page, `hasMore`, and loading state in addition to call counts.

- [ ] **Step 2: Run the domain test and verify RED**

```bash
npm exec vitest run -- apps/h5/src/features/community/useCommunityDomain.test.tsx
```

Expected: FAIL because `loadMoreCommunityPosts` has no sort parameter, duplicate calls can start the same page, and no current-list sort context exists.

- [ ] **Step 3: Implement sort context and synchronous lock**

Change the public result type to:

```ts
loadMoreCommunityPosts: (sort?: 'hot' | 'latest') => Promise<void>;
```

Add one committed pagination snapshot and two operation owners:

```ts
type CommunityListContext = { sort: 'hot' | 'latest'; page: number; hasMore: boolean };
const communityListContextRef = useRef<CommunityListContext | null>(null);
const communityBaseLoadOwnerRef = useRef<symbol | null>(null);
const communityLoadMoreOwnerRef = useRef<symbol | null>(null);
```

`communityListContextRef` always represents the last successfully committed list and is not cleared merely because a refresh starts. At the start of every non-append request, create and store a unique base-load owner and set `communityLoadMoreOwnerRef.current = null` to revoke any pending append owner immediately. While a base-load owner exists, no append may start. This prevents an old append from canceling the new base request and allows the new list to paginate without waiting for the revoked network request to settle.

On a successful current non-append response, atomically replace the committed context with requested sort, returned/requested page, and derived `hasMore`; update the corresponding state/ref values from that snapshot. On a current non-preserved failure, clear the committed context. On a current preserved failure, restore page and `hasMore` state from the unchanged committed snapshot; overlapping non-append requests cannot lose it because temporary requests never overwrite the committed ref. In every base-load `finally`, clear the base owner only when symbol identity still matches.

Before load more, resolve `targetSort = sort ?? communitySort`, then check in order: the callback's captured auth/route operation still matches `operationScopeRef.current`, no base-load owner exists, the committed context exists and has the same sort with `hasMore=true`, and no append owner exists. Create a unique append `Symbol`, store it before invoking the async request, and in `finally` clear the owner only if the ref still equals that symbol. Compute the next page from the committed context, and after a successful current append update its page and `hasMore`. Retain `isCommunityLoadingMore` for rendering.

During logout cleanup, clear the committed context and both current owners. Because old operations compare symbol identity in `finally`, an old completion cannot release a newer session's owner. Existing auth/route scope and request-sequence checks continue to prevent old responses from writing state.

- [ ] **Step 4: Run the domain test and verify GREEN**

Run the same domain Vitest command. Expected: all domain tests PASS.

- [ ] **Step 5: Commit the domain guard**

```bash
git add apps/h5/src/features/community/useCommunityDomain.ts apps/h5/src/features/community/useCommunityDomain.test.tsx
git commit -m "fix(h5): serialize community pagination"
```

### Task 4: Bind the home sentinel to hot sorting

**Files:**
- Modify: `apps/h5/src/features/community/useCommunityHomeAdapter.test.tsx`
- Modify: `apps/h5/src/features/community/useCommunityHomeAdapter.ts`

- [ ] **Step 1: Write a failing home adapter test**

Update the existing home load-more test so the mocked domain reports `communitySort: 'latest'`, call `adapter.loadMoreHomeTemplates()`, and assert:

```ts
expect(loadMoreCommunityPosts).toHaveBeenCalledOnce();
expect(loadMoreCommunityPosts).toHaveBeenCalledWith('hot');
```

- [ ] **Step 2: Run the adapter test and verify RED**

```bash
npm exec vitest run -- apps/h5/src/features/community/useCommunityHomeAdapter.test.tsx
```

Expected: FAIL because the adapter currently calls the domain function without a sort.

- [ ] **Step 3: Implement the explicit hot call**

Change the home callback to `void domain.loadMoreCommunityPosts('hot')`; retain the existing `hasMore` and loading guards.

- [ ] **Step 4: Run the adapter test and verify GREEN**

Run the same adapter Vitest command. Expected: all adapter tests PASS.

- [ ] **Step 5: Commit the adapter contract**

```bash
git add apps/h5/src/features/community/useCommunityHomeAdapter.ts apps/h5/src/features/community/useCommunityHomeAdapter.test.tsx
git commit -m "fix(h5): keep home pagination on hot sort"
```

## Chunk 3: Verification and Review

### Task 5: Full relevant verification

**Files:**
- Verify only

- [ ] **Step 1: Run all directly affected tests**

```bash
npm exec vitest run -- apps/h5/src/shared/ImageWithSkeleton.test.tsx apps/h5/src/community/homeTemplateImageLoading.test.tsx apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx apps/h5/src/features/community/useCommunityDomain.test.tsx apps/h5/src/features/community/useCommunityHomeAdapter.test.tsx apps/h5/src/pages/home/homeRefresh.test.ts
```

Expected: all test files PASS with zero failures.

- [ ] **Step 2: Run the H5 production build**

```bash
npm run build:h5
```

Expected: exit code 0 and Vite build output completes.

- [ ] **Step 3: Check committed and uncommitted patch hygiene and scope**

```bash
git diff --check <recorded-base-sha>..HEAD
git diff --check
git diff --name-only <recorded-base-sha>..HEAD
git status --short
```

Expected: neither diff-check command reports whitespace errors. The committed changed-file list is limited to the ten implementation/test files listed in the File Structure section. Compare final status with the recorded initial status, preserving pre-existing files and rejecting unexpected task-created changes.

- [ ] **Step 4: Request focused code review**

Use `superpowers:requesting-code-review` and provide the reviewer the exact range `<recorded-base-sha>..HEAD`, replacing the placeholder with the recorded literal. Address correctness issues, especially observer cleanup, timer cleanup, stale event handling, pagination lock release, and scope-safe owner invalidation.

- [ ] **Step 5: Commit scoped review fixes**

If review requires changes, add only the reviewed implementation/test files and create a focused commit:

```bash
git add <reviewed implementation and test files>
git commit -m "fix(h5): address thumbnail loading review"
```

If no changes are required, record that no review-fix commit was needed.

- [ ] **Step 6: Re-run final verification**

Use `superpowers:verification-before-completion`, then repeat Steps 1–3 against the same recorded literal baseline. If a review-fix commit was created, also run `git show --check --stat HEAD`. Expected: tests and build pass, both diff checks report no errors, the range contains only the allowlisted files, the last commit is scoped, and final status contains no unexpected task-created changes.
