import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommentAvatar } from './CommentAvatar';

describe('CommentAvatar', () => {
  it.each([null, '', '   '])('shows the user icon fallback for %j', (avatarUrl) => {
    const markup = renderToStaticMarkup(<CommentAvatar avatarUrl={avatarUrl} />);

    expect(markup).toContain('data-comment-avatar-fallback="true"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('lucide-user-round');
    expect(markup).not.toContain('<img');
    expect(markup.replace(/<[^>]+>/g, '').trim()).toBe('');
  });

  it('renders a decorative image for a non-empty avatar URL', () => {
    const markup = renderToStaticMarkup(<CommentAvatar avatarUrl=" https://example.com/avatar.png " />);

    expect(markup).toContain('class="detail-comment-avatar-image"');
    expect(markup).toContain('src="https://example.com/avatar.png"');
    expect(markup).toContain('alt=""');
    expect(markup).not.toContain('data-comment-avatar-fallback="true"');
  });
});
