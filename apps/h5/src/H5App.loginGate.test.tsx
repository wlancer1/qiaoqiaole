import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./app/H5Application.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('./pages/home/HomeShellPage.tsx', import.meta.url), 'utf8');

describe('H5 login gate entry points', () => {
  it('uses one Redux-backed modal contract in HomeShell', () => {
    expect(shellSource).toContain('isLoginModalOpen');
    expect(shellSource).toContain('openLogin');
    expect(shellSource).toContain('closeLogin');
    expect(shellSource).not.toContain('setShowLoginModal');
  });

  it('delegates username and phone success to the authentication feature', () => {
    expect(appSource).toContain("from '../features/auth/useAuthFeature';");
    expect(appSource).toContain('submitPhoneLogin={authDialog.submitPhoneLogin}');
    expect(appSource).toContain('submitPhoneRegister={authDialog.submitPhoneRegister}');
    expect(appSource).not.toContain('pendingAuthActionRef');
    expect(appSource).not.toContain('qiaoqiaole.auth');
  });

  it('delegates logout to the feature and keeps page cleanup local', () => {
    expect(appSource).toContain('logoutAuthSession();');
    expect(appSource).toContain('communityCommandsRef.current?.clearForLogout()');
    expect(appSource).toContain('setRecentProjects([])');
  });
});
