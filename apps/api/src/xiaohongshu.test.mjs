import { describe, expect, test } from 'vitest';
import {
  findFirstImageUrl,
  findImageUrls,
  inspectImageCandidates,
  inspectNoteExtraction,
  isSupportedXiaohongshuUrl,
  mobileHeaders,
  normalizeExtractedImagePayload,
} from './xiaohongshu.mjs';

describe('xiaohongshu extraction helpers', () => {
  test('validates Xiaohongshu URLs by hostname instead of substring', () => {
    expect(isSupportedXiaohongshuUrl('https://www.xiaohongshu.com/discovery/item/1')).toBe(true);
    expect(isSupportedXiaohongshuUrl('http://xhslink.com/o/abc')).toBe(true);
    expect(isSupportedXiaohongshuUrl('https://attacker.example/?next=xiaohongshu.com')).toBe(false);
    expect(isSupportedXiaohongshuUrl('https://xiaohongshu.com.attacker.example/item/1')).toBe(false);
  });

  test('returns note images only from noteDetailMap[noteId].note.imageList', () => {
    const html = String.raw`<script>window.__INITIAL_STATE__={
      "comments":{"list":[{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fcomment-token?imageView2\u002F2\u002Fw\u002F1080"}
      ]}]},
      "note":{"noteDetailMap":{"note-id":{"note":{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fnote-1?imageView2\u002F2\u002Fw\u002F1080"},
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fnote-2?imageView2\u002F2\u002Fw\u002F1080"}
      ]}}}}
    }</script>`;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/discovery/item/note-id')).toEqual([
      'https://ci.xiaohongshu.com/note-1?imageView2/2/w/1600/format/webp',
      'https://ci.xiaohongshu.com/note-2?imageView2/2/w/1600/format/webp',
    ]);
    expect(findFirstImageUrl(html, 'https://www.xiaohongshu.com/discovery/item/note-id')).toBe(
      'https://ci.xiaohongshu.com/note-1?imageView2/2/w/1600/format/webp',
    );
  });

  test('returns note images from setup server state noteData when initial state has no note detail map', () => {
    const html = String.raw`
      <script>window.__SETUP_SERVER_STATE__={"LAUNCHER_SSR_STORE_PAGE_DATA":{"noteData":{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F1\u002F2\u002Fsetup-note-token!note"}
      ],"comments":{"list":[{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F1\u002F2\u002Fsetup-comment-token!comment"}
      ]}]}}}}</script>
      <script>window.__INITIAL_STATE__={"global":{"appSettings":{}}}</script>
    `;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/discovery/item/note-id')).toEqual([
      'https://ci.xiaohongshu.com/setup-note-token?imageView2/2/w/1600/format/webp',
    ]);
    expect(inspectNoteExtraction(html, 'https://www.xiaohongshu.com/discovery/item/note-id')).toMatchObject({
      strategy: 'setup-server-state',
      imageCount: 1,
    });
  });

  test('returns setup server state note images from imageList url fields', () => {
    const html = String.raw`
      <script>window.__SETUP_SERVER_STATE__={"LAUNCHER_SSR_STORE_PAGE_DATA":{"noteData":{"imageList":[
        {
          "url":"http:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F202607062215\u002F4871037a1491f48bbfa6276c3b16927e\u002F1040g2sg322067seunue04busoicoa9v2opqhuuo!h5_1080jpg",
          "infoList":[
            {"url":"http:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F202607062215\u002F4871037a1491f48bbfa6276c3b16927e\u002F1040g2sg322067seunue04busoicoa9v2opqhuuo!h5_1080jpg"}
          ]
        }
      ],"user":{"avatar":"https:\u002F\u002Fsns-avatar-qc.xhscdn.com\u002Favatar\u002Fuser?imageView2\u002F2\u002Fw\u002F120"}}}}</script>
      <script>window.__INITIAL_STATE__={"global":{"appSettings":{}}}</script>
    `;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/discovery/item/6a420c73000000001c025dcc')).toEqual([
      'https://ci.xiaohongshu.com/1040g2sg322067seunue04busoicoa9v2opqhuuo?imageView2/2/w/1600/format/webp',
    ]);
  });

  test('does not use og image, top-level imageList, rendered images, or comments as fallback', () => {
    const html = String.raw`
      <meta content="https://cdn.example.com/og-note.jpg" property="og:image">
      <img src="https://ci.xiaohongshu.com/notes_uhdr/rendered-token?imageView2/2/w/1600/format/webp">
      <script>window.__INITIAL_STATE__={
        "note":{"imageList":[
          {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Ftop-level-note?imageView2\u002F2\u002Fw\u002F1080"}
        ]},
        "comments":{"list":[{"imageList":[
          {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fcomment-token?imageView2\u002F2\u002Fw\u002F1080"}
        ]}]}
      }</script>
    `;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/discovery/item/note-id')).toEqual([]);
    expect(findFirstImageUrl(html, 'https://www.xiaohongshu.com/discovery/item/note-id')).toBe('');
  });

  test('uses the last Xiaohongshu initial state script for note data', () => {
    const html = String.raw`
      <script>window.__INITIAL_STATE__={"comments":{"list":[{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fcomment-token!comment"}
      ]}]}}</script>
      <script>window.__INITIAL_STATE__={"note":{"noteDetailMap":{"note-id":{"note":{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F1\u002F2\u002Fnote-token!note"}
      ]}}}}}</script>
    `;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/explore/note-id')).toEqual([
      'https://ci.xiaohongshu.com/note-token?imageView2/2/w/1600/format/webp',
    ]);
  });

  test('replaces undefined before parsing initial state', () => {
    const html = String.raw`<script>window.__INITIAL_STATE__={"note":{"noteDetailMap":{"note-id":{"note":{"desc":undefined,"imageList":[
      {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F1\u002F2\u002Fnote-token!note"}
    ]}}}}}</script>`;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/explore/note-id')).toEqual([
      'https://ci.xiaohongshu.com/note-token?imageView2/2/w/1600/format/webp',
    ]);
  });

  test('generates no-watermark urls from xhscdn image tokens like XHS-Downloader', () => {
    const html = String.raw`<script>window.__INITIAL_STATE__={"note":{"noteDetailMap":{"note-id":{"note":{"imageList":[
      {"urlDefault":"http:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F1000g0082\u002Fabc12345\u002F1040g00831onb9q826g005p00kg7a3k2q6vlvef8!nd_dft_wlteh_webp_3"}
    ]}}}}}</script>`;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/explore/note-id')).toEqual([
      'https://ci.xiaohongshu.com/1040g00831onb9q826g005p00kg7a3k2q6vlvef8?imageView2/2/w/1600/format/webp',
    ]);
  });

  test('reports strict extraction diagnostics when note imageList is missing', () => {
    const html = String.raw`
      <img src="https://ci.xiaohongshu.com/notes_uhdr/rendered-token?imageView2/2/w/1600/format/webp">
      <script>window.__INITIAL_STATE__={"note":{"noteDetailMap":{"note-id":{"note":{"title":"no images"}}}}}</script>
    `;

    expect(inspectNoteExtraction(html, 'https://www.xiaohongshu.com/discovery/item/note-id')).toMatchObject({
      strategy: 'none',
      imageCount: 0,
      images: [],
      noteId: 'note-id',
      initialState: {
        payloadCount: 1,
        parsed: true,
        noteFound: true,
        imageCount: 0,
      },
    });
  });

  test('keeps broad candidates available only for diagnostics', () => {
    const html = '<meta content="https://ci.xiaohongshu.com/favicon.ico?imageView2/2/w/1600/format/webp" property="og:image">';

    expect(inspectImageCandidates(html, 'https://www.xiaohongshu.com/explore/1').candidates[0]).toMatchObject({
      rejected: true,
    });
    expect(findFirstImageUrl(html, 'https://www.xiaohongshu.com/explore/1')).toBe('');
  });

  test('returns the normalized image url payload without downloading image bytes', () => {
    expect(normalizeExtractedImagePayload({
      imageUrl: 'https://ci.xiaohongshu.com/abc123?imageView2/2/w/1600/format/webp',
      title: 'note',
    })).toEqual({
      imageUrl: 'https://ci.xiaohongshu.com/abc123?imageView2/2/w/1600/format/webp',
      title: 'note',
    });
  });

  test('passes optional Xiaohongshu cookie to upstream requests', () => {
    const previous = process.env.XHS_COOKIE;
    process.env.XHS_COOKIE = 'web_session=abc';
    try {
      expect(mobileHeaders('https://www.xiaohongshu.com/explore/1')).toMatchObject({ cookie: 'web_session=abc' });
      expect(mobileHeaders('https://www.xiaohongshu.com/explore/1', { includeCookie: false })).not.toHaveProperty('cookie');
      expect(mobileHeaders('https://xhslink.com/o/abc')).not.toHaveProperty('cookie');
    } finally {
      if (previous === undefined) delete process.env.XHS_COOKIE;
      else process.env.XHS_COOKIE = previous;
    }
  });
});
