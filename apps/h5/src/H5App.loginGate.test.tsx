import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./H5App.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('./pages/home/HomeShellPage.tsx', import.meta.url), 'utf8');

describe('H5 login gate entry points', () => {
  it('uses one Redux-backed modal contract in HomeShell', () => {
    expect(shellSource).toContain('isLoginModalOpen');
    expect(shellSource).toContain('openLogin');
    expect(shellSource).toContain('closeLogin');
    expect(shellSource).not.toContain('setShowLoginModal');
  });

  it('routes username and phone success through session coordination', () => {
    expect(appSource).toContain('authSessionCoordinator.establishFromUsername');
    expect(appSource).toContain('authSessionCoordinator.establishFromPhone');
    expect(appSource).toContain("start('username')");
    expect(appSource).toContain("start('phone')");
    expect(appSource).not.toContain('pendingAuthActionRef');
    expect(appSource).not.toContain('qiaoqiaole.auth');
  });

  it('cancels the gate before Redux logout and keeps feature cleanup local', () => {
    expect(appSource).toContain('authGate.cancelLogin');
    expect(appSource).toContain('dispatch(logoutSession())');
    expect(appSource).toContain('setFollowingUsers([])');
    expect(appSource).toContain('setRecentProjects([])');
  });
});
