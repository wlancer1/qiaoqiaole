import { describe, expect, it } from 'vitest';
import { beadPatternStats, createBeadPatternCanvas, extractUrlFromText, imageDataToUrl, isSupportedXiaohongshuUrl, parseGridSizeInput } from './h5AppUtils';

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

  it('extracts the new xhslink.cn URL from complete share text', () => {
    expect(extractUrlFromText('拼豆图纸 http://xhslink.cn/o/AYw80EYloim 把口令复制下来')).toBe('http://xhslink.cn/o/AYw80EYloim');
  });
});

describe('isSupportedXiaohongshuUrl', () => {
  it('uses exact hostname boundaries', () => {
    expect(isSupportedXiaohongshuUrl('https://www.xiaohongshu.com/explore/1')).toBe(true);
    expect(isSupportedXiaohongshuUrl('https://attacker.example/?next=xiaohongshu.com')).toBe(false);
  });

  it('accepts only the xhslink.cn root domain on standard HTTP(S) ports', () => {
    const supported = [
      'http://xhslink.cn/o/1',
      'https://xhslink.cn/o/1',
      'http://xhslink.cn:80/o/1',
      'https://xhslink.cn:443/o/1',
    ];
    const unsupported = [
      'https://sub.xhslink.cn/o/1',
      'https://xhslink.cn.attacker.example/o/1',
      'https://xhslink.cn@attacker.example/o/1',
      'https://xhslink.cn:8443/o/1',
      'https://attacker.example/xhslink.cn/o/1',
      'https://attacker.example/?next=https://xhslink.cn/o/1',
    ];

    for (const url of supported) expect(isSupportedXiaohongshuUrl(url), url).toBe(true);
    for (const url of unsupported) expect(isSupportedXiaohongshuUrl(url), url).toBe(false);
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

describe('beadPatternStats', () => {
  it('omits transparent cells instead of exporting them as a white H2 bead', () => {
    expect(beadPatternStats([
      { x: 0, y: 0, color: '#ffffff', transparent: true },
      { x: 1, y: 0, color: '#ff0000', transparent: false },
    ])).toHaveLength(1);
  });

  it('keeps transparent cells transparent in the downloaded pattern grid', () => {
    const calls: Array<{ type: string; args: number[] }> = [];
    const context = {
      beginPath: () => {}, closePath: () => {}, fill: () => {}, fillText: () => {}, lineTo: () => {}, moveTo: () => {}, quadraticCurveTo: () => {}, stroke: () => {},
      clearRect: (...args: number[]) => calls.push({ type: 'clear', args }),
      fillRect: (...args: number[]) => calls.push({ type: 'fill', args }),
      strokeRect: () => {},
    };
    const previousDocument = globalThis.document;
    (globalThis as typeof globalThis & { document: Document }).document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    } as unknown as Document;

    try {
      createBeadPatternCanvas([{ x: 0, y: 0, color: '#ffffff', transparent: true }], 1, 1);
      expect(calls).toContainEqual({ type: 'clear', args: [72, 140, 44, 44] });
      expect(calls).not.toContainEqual({ type: 'fill', args: [72, 140, 44, 44] });
    } finally {
      (globalThis as typeof globalThis & { document?: Document }).document = previousDocument;
    }
  });
});
