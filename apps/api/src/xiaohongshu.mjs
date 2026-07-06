const MAX_EXTRACT_IMAGE_BYTES = 20 * 1024 * 1024;
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const XHS_IMAGE_WIDTH = 1600;
const XHS_IMAGE_FORMAT = 'webp';

export function extractUrlFromText(text) {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0]?.trim() || text.trim();
}

export function findFirstImageUrl(html, baseUrl) {
  return findImageUrls(html, baseUrl, 1)[0] || inspectImageCandidates(html, baseUrl).selected?.url || '';
}

export function findImageUrls(html, baseUrl, limit = 12) {
  return inspectNoteExtraction(html, baseUrl).images.slice(0, limit);
}

export function findEmbeddedImageUrl(html) {
  return inspectImageCandidates(html, '').selected?.url || '';
}

export function inspectImageCandidates(html, baseUrl = '') {
  const normalized = normalizeUrlText(html);
  const noteImageCandidates = findNoteImageListUrls(html, baseUrl).map((url) => ({ source: 'note:imageList:urlDefault', url }));
  const rawCandidates = [
    ...noteImageCandidates,
    { source: 'meta:og:image', url: findMetaContent(html, 'og:image') },
    { source: 'meta:twitter:image', url: findMetaContent(html, 'twitter:image') },
    { source: 'json:image', url: html.match(/"image"\s*:\s*"([^"]+)"/i)?.[1] || '' },
    { source: 'img:src', url: html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || '' },
    ...extractCdnUrls(normalized).map((url) => ({ source: 'embedded:cdn', url })),
  ];

  const candidates = [];
  const seen = new Set();
  for (const candidate of rawCandidates) {
    const resolved = resolveCandidateUrl(candidate.url, baseUrl);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    candidates.push({
      source: candidate.source,
      url: resolved,
      score: imageCandidateScore(resolved),
      rejected: !isLikelyImageUrl(resolved),
    });
  }

  const accepted = candidates
    .filter((candidate) => !candidate.rejected)
    .sort((left, right) => right.score - left.score);

  return {
    selected: accepted[0] || null,
    accepted,
    candidates: candidates
      .sort((left, right) => right.score - left.score)
      .slice(0, 8),
  };
}

export function findNoteImageListUrls(html, baseUrl = '') {
  return inspectNoteExtraction(html, baseUrl).images;
}

export function inspectNoteExtraction(html, baseUrl = '') {
  const noteId = extractNoteId(baseUrl);
  const initialStatePayloads = extractInitialStatePayloads(html);
  const state = extractInitialState(html);
  const note = findNoteData(state, baseUrl);
  const stateUrls = normalizeImageListUrls(note?.imageList, baseUrl);
  const initialState = {
    payloadCount: initialStatePayloads.length,
    parsed: Boolean(state),
    noteFound: Boolean(note),
    imageCount: stateUrls.length,
  };
  if (stateUrls.length > 0) {
    return {
      strategy: 'initial-state',
      noteId,
      imageCount: stateUrls.length,
      images: stateUrls,
      initialState,
      scopedInitialState: { imageCount: 0 },
      renderedNoteImages: { candidateCount: 0, imageCount: 0 },
    };
  }

  const scopedStateUrls = normalizeImageListUrls(findNoteImageListItemsInInitialStateText(html, baseUrl), baseUrl);
  const scopedInitialState = { imageCount: scopedStateUrls.length };
  if (scopedStateUrls.length > 0) {
    return {
      strategy: 'scoped-initial-state',
      noteId,
      imageCount: scopedStateUrls.length,
      images: scopedStateUrls,
      initialState,
      scopedInitialState,
      renderedNoteImages: { candidateCount: 0, imageCount: 0 },
    };
  }

  const rendered = findRenderedNoteImageUrls(html, baseUrl);
  const renderedNoteImages = {
    candidateCount: countRenderedNoteImageCandidates(html, baseUrl),
    imageCount: rendered.length,
  };
  return {
    strategy: rendered.length > 0 ? 'rendered-note-image' : 'none',
    noteId,
    imageCount: rendered.length,
    images: rendered,
    initialState,
    scopedInitialState,
    renderedNoteImages,
  };
}

function normalizeImageListUrls(imageList, baseUrl) {
  if (!Array.isArray(imageList)) return [];
  const seen = new Set();
  const urls = [];
  for (const item of imageList) {
    const resolved = resolveCandidateUrl(item?.urlDefault || '', baseUrl);
    if (!resolved || seen.has(resolved) || !isLikelyImageUrl(resolved)) continue;
    seen.add(resolved);
    urls.push(resolved);
  }
  return urls;
}

function extractInitialState(html) {
  for (const payload of extractInitialStatePayloads(html)) {
    try {
      return JSON.parse(payload);
    } catch {
      continue;
    }
  }
  return null;
}

function extractInitialStatePayloads(html) {
  const payloads = [];
  const scripts = extractScriptTexts(html);
  for (const script of scripts.reverse()) {
    const text = decodeHtml(script).trim();
    const match = text.match(/window\.__INITIAL_STATE__\s*=/);
    if (!match) continue;
    payloads.push(text.slice((match.index ?? 0) + match[0].length).replace(/;\s*$/, '').trim());
  }
  return payloads;
}

function findNoteImageListItemsInInitialStateText(html, baseUrl) {
  const noteId = extractNoteId(baseUrl);
  for (const payload of extractInitialStatePayloads(html)) {
    const scoped = scopeInitialStateToNote(payload, noteId);
    const imageListText = extractArrayAfterKey(scoped, 'imageList');
    const items = parseUrlDefaultItems(imageListText);
    if (items.length > 0) return items;
  }
  return [];
}

function scopeInitialStateToNote(payload, noteId) {
  if (noteId) {
    const noteIdPattern = new RegExp(escapeRegExp(noteId));
    const noteIdMatch = noteIdPattern.exec(payload);
    if (noteIdMatch?.index !== undefined) return payload.slice(noteIdMatch.index);
  }
  const detailMapIndex = payload.lastIndexOf('noteDetailMap');
  if (detailMapIndex >= 0) return payload.slice(detailMapIndex);
  const noteIndex = Math.max(payload.lastIndexOf('"note"'), payload.lastIndexOf('note:'));
  return noteIndex >= 0 ? payload.slice(noteIndex) : '';
}

function extractArrayAfterKey(text, key) {
  if (!text) return '';
  const keyPattern = new RegExp(`["']?${escapeRegExp(key)}["']?\\s*:`, 'i');
  const keyMatch = keyPattern.exec(text);
  if (!keyMatch) return '';
  const openIndex = text.indexOf('[', (keyMatch.index ?? 0) + keyMatch[0].length);
  if (openIndex < 0) return '';
  return readBalanced(text, openIndex, '[', ']');
}

function readBalanced(text, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, index + 1);
    }
  }
  return '';
}

function parseUrlDefaultItems(imageListText) {
  if (!imageListText) return [];
  return [...imageListText.matchAll(/["']?urlDefault["']?\s*:\s*["']([^"']+)["']/gi)]
    .map((match) => ({ urlDefault: match[1] }));
}

function findRenderedNoteImageUrls(html, baseUrl) {
  const normalized = normalizeUrlText(html);
  const seen = new Set();
  const urls = [];
  for (const url of extractCdnUrls(normalized)) {
    const resolved = resolveCandidateUrl(url, baseUrl);
    if (!resolved || seen.has(resolved) || !isRenderedNoteImageUrl(resolved)) continue;
    seen.add(resolved);
    urls.push(resolved);
  }
  return urls;
}

function countRenderedNoteImageCandidates(html, baseUrl) {
  const normalized = normalizeUrlText(html);
  let count = 0;
  const seen = new Set();
  for (const url of extractCdnUrls(normalized)) {
    const resolved = resolveCandidateUrl(url, baseUrl);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    if (isRenderedNoteImageUrl(resolved)) count += 1;
  }
  return count;
}

function isRenderedNoteImageUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'ci.xiaohongshu.com') return false;
    if (!/(?:^|\/)notes_[^/]+\//i.test(parsed.pathname)) return false;
    if (/\.(?:js|css|ico)(?:$|[?#])/i.test(parsed.pathname)) return false;
    return isLikelyImageUrl(url);
  } catch {
    return false;
  }
}

function extractScriptTexts(html) {
  const scripts = [];
  const pattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) scripts.push(match[1] || '');
  if (scripts.length > 0) return scripts;
  return [html];
}

function findNoteData(state, baseUrl) {
  if (!state || typeof state !== 'object') return null;
  const noteId = extractNoteId(baseUrl);
  const detailMap = state.note?.noteDetailMap;
  if (detailMap && typeof detailMap === 'object') {
    const detail = noteId && detailMap[noteId] ? detailMap[noteId] : Object.values(detailMap).at(-1);
    if (detail?.note) return detail.note;
  }
  if (state.note?.note) return state.note.note;
  if (Array.isArray(state.note?.imageList)) return state.note;
  return null;
}

function extractNoteId(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split('/').filter(Boolean).at(-1) || '';
  } catch {
    return '';
  }
}

export function findMetaContent(html, property) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = getHtmlAttribute(tag, 'property') || getHtmlAttribute(tag, 'name');
    if (name !== property) continue;
    return getHtmlAttribute(tag, 'content') || '';
  }
  return '';
}

export function findTitle(html) {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
}

export function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeUrlText(value) {
  return decodeHtml(value)
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}

function extractCdnUrls(normalized) {
  const patterns = [
    /https?:\/\/[^"'\s<>\\]*(?:xhscdn|xiaohongshu)[^"'\s<>\\]*/gi,
    /\/\/[^"'\s<>\\]*(?:xhscdn|xiaohongshu)[^"'\s<>\\]*/gi,
  ];
  return patterns.flatMap((pattern) => normalized.match(pattern) || []);
}

function resolveCandidateUrl(url, baseUrl) {
  if (!url) return '';
  const normalized = normalizeUrlText(url);
  try {
    if (!baseUrl && normalized.startsWith('//')) return normalizeXiaohongshuImageUrl(`https:${normalized}`);
    if (!baseUrl && /^https?:\/\//i.test(normalized)) return normalizeXiaohongshuImageUrl(normalized);
    if (!baseUrl) return '';
    return normalizeXiaohongshuImageUrl(new URL(normalized, baseUrl).toString());
  } catch {
    return '';
  }
}

function normalizeXiaohongshuImageUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'ci.xiaohongshu.com') {
      const token = extractXiaohongshuImageToken(parsed);
      return token ? createXiaohongshuImageUrl(token) : parsed.toString();
    }
    if (/^(?:.+\.)?(?:xhscdn|xiaohongshu)\.com$/i.test(parsed.hostname)) {
      const token = extractXiaohongshuImageToken(parsed);
      return token ? createXiaohongshuImageUrl(token) : url;
    }
    return url;
  } catch {
    return url;
  }
}

function createXiaohongshuImageUrl(token) {
  return `https://ci.xiaohongshu.com/${token}?imageView2/2/w/${XHS_IMAGE_WIDTH}/format/${XHS_IMAGE_FORMAT}`;
}

function extractXiaohongshuImageToken(parsedUrl) {
  const pathParts = String(parsedUrl.pathname || '').split('/').filter(Boolean);
  const tokenParts = /xhscdn\.com$/i.test(parsedUrl.hostname) && pathParts.length > 2
    ? pathParts.slice(2)
    : pathParts;
  return tokenParts.join('/').split('!')[0].replace(/\/+$/, '');
}

function isLikelyImageUrl(url) {
  if (/(?:avatar|sns-avatar|head|profile|favicon\.ico)/i.test(url)) return false;
  return /(?:sns-webpic|ci\.xiaohongshu|xhscdn|imageView2|format\/jpg|format\/png|format\/webp|\.(?:jpe?g|png|webp)(?:[?#]|$))/i.test(url);
}

function preferNoWatermarkUrls(candidates) {
  const ciCandidates = candidates.filter((candidate) => {
    try {
      return new URL(candidate.url).hostname === 'ci.xiaohongshu.com';
    } catch {
      return false;
    }
  });
  return ciCandidates.length > 0 ? ciCandidates : candidates;
}

function compareImageCandidates(left, right) {
  return imageCandidateScore(right) - imageCandidateScore(left);
}

function imageCandidateScore(url) {
  let score = 0;
  if (/ci\.xiaohongshu/i.test(url)) score += 120;
  if (/sns-webpic/i.test(url)) score += 80;
  if (/imageView2/i.test(url)) score += 20;
  if (/w\/(?:720|1080|1280|1440|2160)/i.test(url)) score += 10;
  if (/(?:avatar|sns-avatar|head|profile)/i.test(url)) score -= 1000;
  return score;
}

export function normalizeExtractedImagePayload({ imageUrl, imageDataUrl, title }) {
  if (!imageUrl) throw new Error('未找到可提取的图片');
  return {
    imageUrl,
    title: decodeHtml(title || '小红书图纸'),
  };
}


export function mobileHeaders(url = '', { includeCookie = true } = {}) {
  const headers = {
    'user-agent': MOBILE_UA,
    accept: 'text/html,application/xhtml+xml',
  };
  if (includeCookie && process.env.XHS_COOKIE && shouldSendXhsCookie(url)) headers.cookie = process.env.XHS_COOKIE;
  return headers;
}

function shouldSendXhsCookie(url) {
  try {
    const parsed = new URL(url);
    return isXiaohongshuCookieHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isXiaohongshuCookieHost(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === 'xiaohongshu.com' || normalized.endsWith('.xiaohongshu.com');
}

export function isSupportedXiaohongshuUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return isSupportedXiaohongshuHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function isSupportedXiaohongshuHost(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === 'xiaohongshu.com'
    || normalized.endsWith('.xiaohongshu.com')
    || normalized === 'xhslink.com'
    || normalized.endsWith('.xhslink.com');
}

export function createXhsLogger(scope = 'xhs') {
  return {
    info(event, details = {}) {
      console.info(`[${scope}] ${event}`, details);
    },
    error(event, details = {}) {
      console.error(`[${scope}] ${event}`, details);
    },
  };
}

export function redactUrl(url) {
  if (!url) return '';
  return url.length > 180 ? `${url.slice(0, 180)}...` : url;
}

function getHtmlAttribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`${escaped}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1] ? decodeHtml(match[1]) : '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
