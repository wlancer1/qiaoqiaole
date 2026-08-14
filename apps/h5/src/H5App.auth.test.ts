import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('H5App canvas authentication fallback', () => {
  it('renders project folder overlays at the H5App layer and locks background scrolling', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');

    expect(source).toContain("document.body.classList.toggle('h5-modal-open', hasBlockingModal)");
    expect(source).toContain('const projectFolderSheets = <>');
    expect(source).toContain('className="h5-app-shell"');
    expect(source).toContain('className="h5-app-overlays"');
    expect(source).toContain('{projectFolderSheets}');
    expect(source).not.toContain('const projectFolderCreateDialog = showProjectFolderCreate ?');
    expect(source).toContain('const openProjectActions = (project: RecentProject) =>');
    expect(source).toContain('projectActionReturnFocusRef.current');
  });

  it('renders the shared login modal while the canvas screen is active', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');
    expect(source).toContain('<CanvasPage');
    expect(source).toContain("createProjectFolder={() => openProjectFolderCreate('save')}");
    expect(source).toContain('projectFolderSheetOpen={showProjectFolderCreate}');
  });

  it('keeps create and move state at the top layer while requests are pending', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');

    expect(source).toContain("const [projectFolderCreateOrigin, setProjectFolderCreateOrigin] = useState<ProjectFolderCreateOrigin>('my-works')");
    expect(source).toContain('const [projectFolderMoveTarget, setProjectFolderMoveTarget] = useState<RecentProject | null>(null)');
    expect(source).toContain('covered={showProjectFolderCreate}');
    expect(source).toContain('ensureProjectFolderHistorySentinel');
    expect(source).toContain('consumeProjectFolderHistorySentinel');
    expect(source).toContain('resolveProjectFolderHistoryPop');
  });

  it('does not forward the save button click event as an authentication token', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/pages/editor/CanvasPage.tsx'), 'utf8');

    expect(source).toContain('onClick={() => saveCurrentProject()}');
    expect(source).not.toContain('onClick={saveCurrentProject}');
  });

  it('clears all follow-related profile state on logout', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');
    const logoutBody = source.match(/const logoutPhone = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '';

    expect(logoutBody).toContain('setFollowingCount(0);');
    expect(logoutBody).toContain('setFollowersCount(0);');
    expect(logoutBody).toContain('setFollowingUsers([]);');
    expect(logoutBody).toContain('setFollowersUsers([]);');
  });

  it('scopes status messages to the current screen and tab', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');

    expect(source).toContain("const statusScopeRef = useRef(`${screen}:${activeTab}`);");
    expect(source).toContain('const statusScope = `${screen}:${activeTab}`;');
    expect(source).toContain('if (statusScopeRef.current !== statusScope) return;');
    expect(source).toContain('setStatusState(\'\');');
  });

  it('uses layered route and page loading states instead of plain loading paragraphs', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');

    expect(source).toContain('<H5RoutedContent renderPage={renderPage} />');
    expect(source).toContain("lazy(() => import('./pages/editor/CanvasPage')");
    expect(source).toContain('<PageSkeleton kind="editor" label="正在加载作品" />');
    expect(source).toContain('<PageSkeleton kind="warehouse" label="正在加载仓库" />');
    expect(source).toContain('<PageSkeleton kind="pattern-detail" label="正在加载作品" />');
    expect(source).toContain('<PageSkeleton kind="profile-list" label="正在加载关注列表" />');
    expect(source).not.toContain('<p className="community-empty">正在加载作品…</p>');
  });
});
