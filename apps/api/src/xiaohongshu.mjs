const MAX_EXTRACT_IMAGE_BYTES = 20 * 1024 * 1024;
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const XHS_IMAGE_WIDTH = 1600;
const XHS_IMAGE_FORMAT = 'webp';

// 小红书提图原则：
// 1. 正式结果只应该来自笔记对象里的 imageList，参考 XHS-Downloader 的 note.imageList 逻辑。
// 2. 目前接受两个明确的笔记对象来源：__INITIAL_STATE__.note.noteDetailMap[id].note
//    和 __SETUP_SERVER_STATE__.LAUNCHER_SSR_STORE_PAGE_DATA.noteData。
// 3. comments、avatar、static assets 只能出现在诊断候选里，不能作为笔记图片返回给业务。
// 4. ci.xiaohongshu.com 链接会被统一改写为无水印、压缩后的固定宽度 webp。

export function extractUrlFromText(text) {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0]?.trim() || text.trim();
}

export function findFirstImageUrl(html, baseUrl) {
  return findImageUrls(html, baseUrl, 1)[0] || '';
}

export function findImageUrls(html, baseUrl, limit = 12) {
  return inspectNoteExtraction(html, baseUrl).images.slice(0, limit);
}

export function findEmbeddedImageUrl(html) {
  return inspectImageCandidates(html, '').selected?.url || '';
}

// 这个函数是“宽扫描”的诊断工具，会扫描 meta/img/script 中的 CDN URL。
// 它可能包含评论图或页面资源；业务提取不要直接把 accepted 当成笔记图列表。
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

// 这是小红书笔记图的唯一业务入口。
// 和原 Python 逻辑保持一致：只取 __INITIAL_STATE__.note.noteDetailMap[noteId].note.imageList。
// 解析不到就返回空结果，让接口返回 422；不要用 og:image、评论、渲染图片兜底。
export function inspectNoteExtraction(html, baseUrl = '') {
  const noteId = extractNoteId(baseUrl);
  const initialStatePayloads = extractInitialStatePayloads(html);
  const state = extractInitialState(html);
  const note = findNoteData(state, baseUrl);
  const stateUrls = normalizeImageListUrls(note?.imageList, baseUrl);
  const setupStatePayloads = extractSetupServerStatePayloads(html);
  const setupState = extractSetupServerState(html);
  const setupNote = findSetupServerNoteData(setupState);
  const setupStateUrls = normalizeImageListUrls(setupNote?.imageList, baseUrl);
  const initialState = {
    payloadCount: initialStatePayloads.length,
    parsed: Boolean(state),
    noteFound: Boolean(note),
    imageCount: stateUrls.length,
  };
  const setupServerState = {
    payloadCount: setupStatePayloads.length,
    parsed: Boolean(setupState),
    noteFound: Boolean(setupNote),
    imageCount: setupStateUrls.length,
    noteKeys: setupNote && typeof setupNote === 'object' ? Object.keys(setupNote).slice(0, 40) : [],
    imageLikePaths: setupNote ? findImageLikePaths(setupNote).slice(0, 20) : [],
  };
  if (stateUrls.length > 0) {
    return {
      strategy: 'initial-state',
      noteId,
      imageCount: stateUrls.length,
      images: stateUrls,
      initialState,
      setupServerState,
      scopedInitialState: { imageCount: 0 },
      renderedNoteImages: { candidateCount: 0, imageCount: 0 },
    };
  }
  if (setupStateUrls.length > 0) {
    return {
      strategy: 'setup-server-state',
      noteId,
      imageCount: setupStateUrls.length,
      images: setupStateUrls,
      initialState,
      setupServerState,
      scopedInitialState: { imageCount: 0 },
      renderedNoteImages: { candidateCount: 0, imageCount: 0 },
    };
  }

  return {
    strategy: 'none',
    noteId,
    imageCount: 0,
    images: [],
    initialState,
    setupServerState,
    scopedInitialState: { imageCount: 0 },
    renderedNoteImages: { candidateCount: 0, imageCount: 0 },
  };
}

// imageList 里只接受笔记图片字段 urlDefault/url。评论、头像等字段即使也是图片，也不会从这里进入结果。
function normalizeImageListUrls(imageList, baseUrl) {
  if (!Array.isArray(imageList)) return [];
  const seen = new Set();
  const urls = [];
  for (const item of imageList) {
    const resolved = resolveCandidateUrl(item?.urlDefault || item?.url || '', baseUrl);
    if (!resolved || seen.has(resolved) || !isLikelyImageUrl(resolved)) continue;
    seen.add(resolved);
    urls.push(resolved);
  }
  return urls;
}

function extractInitialState(html) {
  for (const payload of extractInitialStatePayloads(html)) {
    try {
      return JSON.parse(payload.replace(/\bundefined\b/g, '""'));
    } catch {
      continue;
    }
  }
  return null;
}

function extractInitialStatePayloads(html) {
  const payloads = [];
  const scripts = extractScriptTexts(html);
  // 页面里可能有多个 __INITIAL_STATE__，后面的脚本通常更接近当前详情页状态。
  for (const script of scripts.reverse()) {
    const text = decodeHtml(script).trim();
    const match = text.match(/window\.__INITIAL_STATE__\s*=/);
    if (!match) continue;
    payloads.push(text.slice((match.index ?? 0) + match[0].length).replace(/;\s*$/, '').trim());
  }
  return payloads;
}

function extractSetupServerState(html) {
  for (const payload of extractSetupServerStatePayloads(html)) {
    try {
      return JSON.parse(payload.replace(/\bundefined\b/g, '""'));
    } catch {
      continue;
    }
  }
  return null;
}

function extractSetupServerStatePayloads(html) {
  const payloads = [];
  const scripts = extractScriptTexts(html);
  for (const script of scripts.reverse()) {
    const text = decodeHtml(script).trim();
    const match = text.match(/window\.__SETUP_SERVER_STATE__\s*=/);
    if (!match) continue;
    payloads.push(text.slice((match.index ?? 0) + match[0].length).replace(/;\s*$/, '').trim());
  }
  return payloads;
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
    const detail = noteId ? detailMap[noteId] : null;
    if (detail?.note) return detail.note;
  }
  return null;
}

function findSetupServerNoteData(state) {
  if (!state || typeof state !== 'object') return null;
  const noteData = state.LAUNCHER_SSR_STORE_PAGE_DATA?.noteData;
  return noteData && typeof noteData === 'object' ? noteData : null;
}

function findImageLikePaths(value, path = 'noteData', depth = 0, results = []) {
  if (depth > 5 || results.length >= 40) return results;
  if (typeof value === 'string') {
    if (/(?:xhscdn|xiaohongshu|imageView2|urlDefault)/i.test(value)) {
      results.push({ path, sample: value.slice(0, 160) });
    }
    return results;
  }
  if (!value || typeof value !== 'object') return results;
  if (Array.isArray(value)) {
    value.slice(0, 5).forEach((item, index) => findImageLikePaths(item, `${path}[${index}]`, depth + 1, results));
    return results;
  }
  for (const [key, child] of Object.entries(value)) {
    if (results.length >= 40) break;
    findImageLikePaths(child, `${path}.${key}`, depth + 1, results);
  }
  return results;
}

// 从页面 URL 中取作品 ID，用于定位 noteDetailMap[作品ID]。
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

// 将 xhscdn / ci 图片统一转为 ci.xiaohongshu.com 的无水印固定格式。
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

// xhscdn 原图路径通常是 /bucket/hash/token!suffix，真正可用的是 ! 前的 token。
function extractXiaohongshuImageToken(parsedUrl) {
  const pathParts = String(parsedUrl.pathname || '').split('/').filter(Boolean);
  const tokenParts = /xhscdn\.com$/i.test(parsedUrl.hostname) && pathParts.length > 2
    ? pathParts.slice(2)
    : pathParts;
  return tokenParts.join('/').split('!')[0].replace(/\/+$/, '');
}

// 基础图片过滤：排除头像、favicon，只保留可能的笔记图片 CDN。
function isLikelyImageUrl(url) {
  if (/(?:avatar|sns-avatar|head|profile|favicon\.ico)/i.test(url)) return false;
  return /(?:sns-webpic|ci\.xiaohongshu|xhscdn|imageView2|format\/jpg|format\/png|format\/webp|\.(?:jpe?g|png|webp)(?:[?#]|$))/i.test(url);
}

// 下面几个候选排序函数只服务 inspectImageCandidates 的日志和诊断，不代表业务返回策略。
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


// cookie 只能发给 xiaohongshu.com 页面请求，不能发给短链或任意第三方跳转地址。
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
