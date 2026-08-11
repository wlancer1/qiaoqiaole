import { describe, expect, test, vi } from 'vitest';
import {
  fetchWithValidatedXhsRedirects,
  fetchXiaohongshuPage,
  isXhsLinkUrl,
} from './xhsRedirects.mjs';

function upstreamResponse(status, location = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(location ? { location } : {}),
    text: async () => '',
  };
}

describe('validated Xiaohongshu redirects', () => {
  test('keeps cookies off xhslink.cn redirects and adds them only on the HTTPS note request', async () => {
    const previousCookie = process.env.XHS_COOKIE;
    process.env.XHS_COOKIE = 'web_session=abc';
    try {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(upstreamResponse(302, '/o/second'))
        .mockResolvedValueOnce(upstreamResponse(302, 'https://www.xiaohongshu.com/explore/id'))
        .mockResolvedValueOnce(upstreamResponse(200));
      const logger = { info: vi.fn() };

      const response = await fetchXiaohongshuPage('http://xhslink.cn/o/first', logger, {
        useCookie: true,
        fetchImpl,
      });

      expect(response.status).toBe(200);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(fetchImpl.mock.calls[0][0]).toBe('http://xhslink.cn/o/first');
      expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('cookie');
      expect(fetchImpl.mock.calls[1][0]).toBe('http://xhslink.cn/o/second');
      expect(fetchImpl.mock.calls[1][1].headers).not.toHaveProperty('cookie');
      expect(fetchImpl.mock.calls[2][0]).toBe('https://www.xiaohongshu.com/explore/id');
      expect(fetchImpl.mock.calls[2][1].headers).toMatchObject({ cookie: 'web_session=abc' });
    } finally {
      if (previousCookie === undefined) delete process.env.XHS_COOKIE;
      else process.env.XHS_COOKIE = previousCookie;
    }
  });

  test('classifies the new root short-link domain without opening its subdomains', () => {
    expect(isXhsLinkUrl('https://xhslink.cn/o/1')).toBe(true);
    expect(isXhsLinkUrl('https://sub.xhslink.cn/o/1')).toBe(false);
    expect(isXhsLinkUrl('https://xhslink.com/o/1')).toBe(true);
    expect(isXhsLinkUrl('https://sub.xhslink.com/o/1')).toBe(true);
  });

  test('rejects a third-party redirect before making a request to it', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(upstreamResponse(302, 'https://attacker.example/steal'));
    const logger = { info: vi.fn() };

    const response = await fetchWithValidatedXhsRedirects('https://xhslink.cn/o/1', logger, { fetchImpl });

    expect(response).toMatchObject({ ok: false, status: 400, url: 'https://attacker.example/steal' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('request_rejected', expect.objectContaining({
      reason: 'unsupported_redirect_host',
    }));
  });

  test('resolves a relative Location against the current URL and validates it again', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(upstreamResponse(302, '../next'))
      .mockResolvedValueOnce(upstreamResponse(200));
    const logger = { info: vi.fn() };

    const response = await fetchWithValidatedXhsRedirects('https://xhslink.cn/o/first', logger, { fetchImpl });

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://xhslink.cn/next');
  });

  test('stops after five redirect responses', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      const current = new URL(url);
      const next = Number(current.searchParams.get('step') || 0) + 1;
      return upstreamResponse(302, `/o/loop?step=${next}`);
    });
    const logger = { info: vi.fn() };

    const response = await fetchWithValidatedXhsRedirects('https://xhslink.cn/o/loop', logger, { fetchImpl });

    expect(response).toMatchObject({ ok: false, status: 508 });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
});
