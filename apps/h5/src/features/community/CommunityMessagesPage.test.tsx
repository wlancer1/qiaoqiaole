import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CommunityMessagesPage } from './CommunityMessagesPage';

describe('CommunityMessagesPage', () => {
  beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  it('routes a notification click through the feature notification command', async () => {
    const openNotification = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<CommunityMessagesPage
        isLoggedIn
        notifications={[{ id: 'notice-1', senderName: '小乔', senderAvatar: '', content: '评论了你的作品', createdAt: '2026-08-15T00:00:00.000Z', isRead: false } as never]}
        openNotification={openNotification}
        openLogin={vi.fn()}
      />);
    });
    const item = renderer.root.findByProps({ className: 'pattern-message-item' });
    act(() => { item.props.onClick(); });
    expect(openNotification).toHaveBeenCalledWith(expect.objectContaining({ id: 'notice-1' }));
  });
});
