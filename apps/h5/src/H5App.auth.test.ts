import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const applicationSource = fs.readFileSync(path.resolve('apps/h5/src/app/H5Application.tsx'), 'utf8');

describe('H5App canvas authentication fallback', () => {
  it('registers project folder overlays with the persistent application host', () => {
    const source = applicationSource;

    expect(source).toContain("document.body.classList.toggle('h5-modal-open', hasBlockingModal)");
    expect(source).toContain('useProjectFolderController');
    expect(source).toContain("useAppOverlay");
    expect(source).not.toContain("setOverlaySlot('folder', projectFolderSheets)");
    expect(source).not.toContain('className="h5-app-overlays"');
    expect(source).not.toContain('const projectFolderCreateDialog = showProjectFolderCreate ?');
    expect(source).toContain('useProjectActionOverlay');
    expect(source).not.toContain('const openProjectActions = (project: RecentProject) =>');
  });

  it('registers the shared login modal while the canvas screen is active', () => {
    const source = applicationSource;
    const editor = fs.readFileSync(path.resolve('apps/h5/src/features/editor/EditorFeatureContent.tsx'), 'utf8');
    expect(source).toContain('<EditorFeatureContent');
    expect(source).toContain("setOverlaySlot('login', loginModalFallback)");
    expect(source).toContain('onSave={() => projectSaveOverlay.open()}');
    expect(editor).toContain('showSaveProjectModal={false}');
    expect(editor).toContain('saveCurrentProject={saveCurrent}');
  });

  it('delegates the composed authentication controller to the auth feature boundary', () => {
    const source = applicationSource;

    expect(source).toContain("from '../features/auth/useAuthFeature';");
    expect(source).toContain('const authFeature = useAuthFeature({');
    expect(source).toContain('authDialog.restoreRememberedLogin()');
    expect(source).toContain('rememberPassword={authDialog.rememberPassword} setRememberPassword={authDialog.setRememberPassword}');
    expect(source).not.toContain("const [phoneNumber, setPhoneNumber] = useState('')");
  });

  it('does not keep phone authentication handlers in the app coordinator', () => {
    const source = applicationSource;

    expect(source).not.toContain("const submitPhoneAuth = async (mode: 'login' | 'register')");
    expect(source).toContain('submitPhoneLogin={authDialog.submitPhoneLogin}');
    expect(source).toContain('submitPhoneRegister={authDialog.submitPhoneRegister}');
    expect(source).not.toContain('const profileEditor = useProfileEditor({');
    expect(source).not.toContain('createAuthSessionCoordinator({');
    expect(source).not.toContain('createPhoneAuthTransport');
    expect(source).not.toContain("const [profileEditName, setProfileEditName] = useState('')");
  });

  it('keeps create and move state at the top layer while requests are pending', () => {
    const source = applicationSource;

    expect(source).toContain('useProjectFolderController');
    expect(source).not.toContain('const [projectFolderMoveTarget');
  });

  it('does not forward the save button click event as an authentication token', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/pages/editor/CanvasPage.tsx'), 'utf8');

    expect(source).toContain('onClick={() => saveCurrentProject()}');
    expect(source).not.toContain('onClick={saveCurrentProject}');
  });

  it('clears all follow-related profile state on logout', () => {
    const source = applicationSource;
    const logoutBody = source.match(/const logoutPhone = (?:useCallback\()?async \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '';

    expect(logoutBody).toContain('logoutAuthSession();');
    expect(logoutBody).toContain('communityCommandsRef.current?.clearForLogout();');
  });

  it('delegates route-scoped status visibility and auto dismissal to the host', () => {
    const source = applicationSource;

    expect(source).toContain('useScopedStatus');
    expect(source).not.toContain('useStatusAutoDismiss');
    expect(source).toContain("const status = '';");
    expect(source).not.toContain('setStatusState');
    expect(source).not.toContain('statusScopeRef');
    expect(source).not.toContain('`${screen}:${activeTab}`');
  });

  it('does not retain the obsolete setScreen-based community post route escape hatch', () => {
    const source = applicationSource;

    expect(source).not.toContain("if (nextScreen === 'pattern-detail' && resourceId)");
    expect(source).not.toContain('`/community/posts/${encodeURIComponent(resourceId)}`');
  });

  it('uses layered route and page loading states instead of plain loading paragraphs', () => {
    const source = applicationSource;
    const communityContent = fs.readFileSync(path.resolve('apps/h5/src/features/community/CommunityFeatureContent.tsx'), 'utf8');
    const communityRoutes = fs.readFileSync(path.resolve('apps/h5/src/features/community/CommunityRoutePages.tsx'), 'utf8');

    expect(source).toContain('<H5RoutedContent renderPage={renderPage} />');
    expect(source).toContain('<EditorFeatureContent');
    expect(fs.readFileSync(path.resolve('apps/h5/src/features/editor/EditorFeatureContent.tsx'), 'utf8')).toContain('<PageSkeleton kind="editor" label="正在加载作品" />');
    expect(source).toContain('<WarehouseFeatureContent');
    expect(communityRoutes).toContain('<PageSkeleton kind="pattern-detail" label={detailLoading ? \'正在加载作品\' : \'作品不存在\'} />');
    expect(communityRoutes).toContain('<PageSkeleton kind="profile-list" label={following ? \'正在加载关注列表\' : \'正在加载粉丝列表\'} />');
    expect(communityContent).toContain('<PageSkeleton kind="pattern-list" label="正在加载发现作品" />');
    expect(source).not.toContain('<p className="community-empty">正在加载作品…</p>');
  });
});
