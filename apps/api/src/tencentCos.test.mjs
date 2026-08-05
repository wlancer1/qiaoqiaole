import { describe, expect, it } from 'vitest';
import { createSignedCosUrl } from './tencentCos.mjs';

describe('Tencent COS signed asset URLs', () => {
  it('creates a temporary signed URL for a private COS asset', () => {
    const url = createSignedCosUrl('cos://demo-1250000000/uploads/projects/user/thumb.webp', {
      secretId: 'secret-id',
      secretKey: 'secret-key',
      bucket: 'demo-1250000000',
      region: 'ap-guangzhou',
      privateDomain: 'cos.example.com',
      protocol: 'https',
      signExpires: 900,
    });

    expect(url).toMatch(/^https:\/\/cos\.example\.com\/uploads\/projects\/user\/thumb\.webp\?/);
    expect(url).toContain('q-sign-algorithm=sha1');
    expect(url).toContain('q-ak=secret-id');
    expect(url).not.toContain('secret-key');
    expect(url).toContain('q-sign-time=');
    expect(url).toContain('q-signature=');
  });

  it('rejects asset paths from another bucket', () => {
    expect(() => createSignedCosUrl('cos://other-bucket/path/image.webp', {
      secretId: 'secret-id',
      secretKey: 'secret-key',
      bucket: 'demo-1250000000',
      region: 'ap-guangzhou',
    })).toThrow('COS 资源路径无效');
  });
});
