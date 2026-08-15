import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UserAvatar } from './UserAvatar';

describe('UserAvatar', () => {
  it('uses the shared centered fallback wrapper for every default avatar', () => {
    const markup = renderToStaticMarkup(createElement(UserAvatar, { className: 'profile-avatar-content' }));

    expect(markup).toContain('user-avatar-image');
  });
});
