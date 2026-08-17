import { act, create } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createH5Store } from '../../store/store';
import { sessionEstablished } from '../../store/auth/authEvents';
import { CommunityFeatureProvider, useCommunityFeature } from './CommunityFeatureProvider';

describe('CommunityFeatureProvider message route', () => {
  beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

  it('reloads persisted notifications when /messages is opened directly', async () => {
    const store = createH5Store({ storage: undefined });
    store.dispatch(sessionEstablished({ token: 'token-1', user: { id: 'user-1', username: 'u', displayName: '用户', avatarUrl: '', legacyDraftOwnerId: '', likesCount: 0, followingCount: 0, followersCount: 0 } }));
    const requestApi = vi.fn().mockResolvedValue({ notifications: [{ id: 'notice-1', content: '历史消息', createdAt: '', isRead: false, senderId: 'sender-1', senderName: '小乔' }] });
    let notifications: ReturnType<typeof useCommunityFeature>['domain']['notifications'] = [];
    function Probe() { notifications = useCommunityFeature().domain.notifications; return null; }

    await act(async () => {
      create(<Provider store={store}><MemoryRouter initialEntries={['/messages']}><CommunityFeatureProvider requestApi={requestApi} requireLogin={vi.fn()} loadFollowingCount={vi.fn()}><Probe /></CommunityFeatureProvider></MemoryRouter></Provider>);
      await Promise.resolve();
    });

    expect(requestApi).toHaveBeenCalledWith('/notifications', { headers: { authorization: 'Bearer token-1' } }, 'token-1');
    expect(notifications).toHaveLength(1);
  });
});
