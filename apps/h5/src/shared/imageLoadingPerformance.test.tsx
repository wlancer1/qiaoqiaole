import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ImageWithSkeleton } from './ImageWithSkeleton';

describe('list image loading', () => {
  it('lazy-loads images by default', () => {
    const markup = renderToStaticMarkup(createElement(ImageWithSkeleton, {
      src: '/thumb.webp',
      alt: '',
      fallback: null,
    }));

    expect(markup).toContain('loading="lazy"');
  });
});
