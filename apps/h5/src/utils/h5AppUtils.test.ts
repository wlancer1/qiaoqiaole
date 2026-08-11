import { describe, expect, it } from 'vitest';
import { extractUrlFromText, imageDataToUrl, isSupportedXiaohongshuUrl, parseGridSizeInput } from './h5AppUtils';

describe('parseGridSizeInput', () => {
  it('keeps an empty draft empty so a number input can be edited', () => {
    expect(parseGridSizeInput('')).toBe('');
  });

  it('keeps a typed multi-digit value intact until it is normalized on commit', () => {
    expect(parseGridSizeInput('104')).toBe(104);
  });
});

describe('extractUrlFromText', () => {
  it('extracts the first URL and removes ASCII and Chinese sentence punctuation', () => {
    expect(extractUrlFromText('复制这段文案 https://xhslink.com/o/abc?x=1#note）。继续看看')).toBe('https://xhslink.com/o/abc?x=1#note');
    expect(extractUrlFromText('https://www.xiaohongshu.com/explore/abc。')).toBe('https://www.xiaohongshu.com/explore/abc');
  });

  it('returns empty for text without an HTTP(S) URL', () => {
    expect(extractUrlFromText('这是一段没有链接的分享文案')).toBe('');
  });
});

describe('isSupportedXiaohongshuUrl', () => {
  it('uses exact hostname boundaries', () => {
    expect(isSupportedXiaohongshuUrl('https://www.xiaohongshu.com/explore/1')).toBe(true);
    expect(isSupportedXiaohongshuUrl('https://attacker.example/?next=xiaohongshu.com')).toBe(false);
  });
});

describe('imageDataToUrl', () => {
  it('serializes image data as compressed WebP by default', () => {
    const calls: unknown[][] = [];
    const previousDocument = globalThis.document;
    (globalThis as typeof globalThis & { document: Document }).document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ putImageData: () => {} }),
        toDataURL: (...args: unknown[]) => {
          calls.push(args);
          return 'data:image/webp;base64,AA==';
        },
      }),
    } as unknown as Document;

    try {
      expect(imageDataToUrl({ width: 1, height: 1, data: new Uint8ClampedArray(4) } as ImageData)).toBe('data:image/webp;base64,AA==');
      expect(calls).toEqual([['image/webp', 0.86]]);
    } finally {
      (globalThis as typeof globalThis & { document?: Document }).document = previousDocument;
    }
  });
});
