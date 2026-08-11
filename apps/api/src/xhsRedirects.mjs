import {
  isSupportedXiaohongshuUrl,
  mobileHeaders,
  redactUrl,
} from './xiaohongshu.mjs';

export function isXhsLinkUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'xhslink.cn'
      || hostname === 'xhslink.com'
      || hostname.endsWith('.xhslink.com');
  } catch {
    return false;
  }
}

export async function fetchWithValidatedXhsRedirects(
  startUrl,
  logger,
  { useCookie = false, includeCookieForFirstRequest = false, fetchImpl = fetch } = {},
) {
  let currentUrl = startUrl;
  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    const response = await fetchImpl(currentUrl, {
      redirect: 'manual',
      headers: mobileHeaders(currentUrl, {
        includeCookie: redirectCount === 0 ? includeCookieForFirstRequest : useCookie,
      }),
    });
    const location = response.headers.get('location') || '';
    if (!isRedirectStatus(response.status) || !location) return response;

    let resolvedUrl;
    try {
      resolvedUrl = new URL(location, currentUrl).toString();
    } catch {
      resolvedUrl = location;
    }
    logger.info('redirect_response', {
      status: response.status,
      from: redactUrl(currentUrl),
      location: redactUrl(resolvedUrl),
    });
    if (!isSupportedXiaohongshuUrl(resolvedUrl)) {
      logger.info('request_rejected', {
        reason: 'unsupported_redirect_host',
        finalUrl: redactUrl(resolvedUrl),
      });
      return createRejectedUpstreamResponse(resolvedUrl);
    }
    currentUrl = resolvedUrl;
  }

  return createRejectedUpstreamResponse(currentUrl, 508);
}

export async function fetchXiaohongshuPage(noteUrl, logger, { useCookie = false, fetchImpl = fetch } = {}) {
  return fetchWithValidatedXhsRedirects(noteUrl, logger, {
    useCookie,
    includeCookieForFirstRequest: useCookie && !isXhsLinkUrl(noteUrl),
    fetchImpl,
  });
}

function isRedirectStatus(status) {
  return status >= 300 && status < 400;
}

function createRejectedUpstreamResponse(url, status = 400) {
  return {
    ok: false,
    status,
    url,
    headers: new Headers(),
    text: async () => '',
  };
}
