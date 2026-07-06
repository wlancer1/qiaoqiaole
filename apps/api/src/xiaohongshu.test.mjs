import { describe, expect, test } from 'vitest';
import {
  findFirstImageUrl,
  findImageUrls,
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

  test('finds og image when content appears before property', () => {
    const html = '<meta content="https://cdn.example.com/note.jpg" property="og:image">';

    expect(findFirstImageUrl(html, 'https://www.xiaohongshu.com/explore/1')).toBe('https://cdn.example.com/note.jpg');
  });

  test('finds image urls from Xiaohongshu embedded state when og image is missing', () => {
    const html = String.raw`<script>window.__INITIAL_STATE__={"note":{"imageList":[{"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fabc123?imageView2\u002F2\u002Fw\u002F1080"}]}}</script>`;

    expect(findFirstImageUrl(html, 'https://www.xiaohongshu.com/discovery/item/1')).toBe(
      'https://ci.xiaohongshu.com/abc123?imageView2/2/w/1600/format/webp',
    );
  });

  test('prefers note images over user avatar images', () => {
    const html = String.raw`<script>window.__INITIAL_STATE__={
      "user":{"avatar":"https:\u002F\u002Fsns-avatar-qc.xhscdn.com\u002Favatar-user?imageView2\u002F2\u002Fw\u002F120"},
      "note":{"imageList":[{"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fnote-image?imageView2\u002F2\u002Fw\u002F1080"}]}
    }</script>`;

    expect(findFirstImageUrl(html, 'https://www.xiaohongshu.com/discovery/item/1')).toBe(
      'https://ci.xiaohongshu.com/note-image?imageView2/2/w/1600/format/webp',
    );
  });

  test('ignores generic image fields that point at avatars', () => {
    const html = String.raw`<script>window.__INITIAL_STATE__={
      "image":"https:\u002F\u002Fsns-avatar-qc.xhscdn.com\u002Favatar\u002Fuser.jpg?imageView2\u002F2\u002Fw\u002F120\u002Fformat\u002Fjpg",
      "note":{"imageList":[{"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fnote-body?imageView2\u002F2\u002Fw\u002F1080\u002Fformat\u002Fjpg"}]}
    }</script>`;

    expect(findFirstImageUrl(html, 'https://www.xiaohongshu.com/discovery/item/1')).toBe(
      'https://ci.xiaohongshu.com/note-body?imageView2/2/w/1600/format/webp',
    );
  });

  test('returns multiple note image urls without avatar candidates', () => {
    const html = String.raw`<script>window.__INITIAL_STATE__={
      "avatar":"https:\u002F\u002Fsns-avatar-qc.xhscdn.com\u002Favatar\u002Fuser.jpg?imageView2\u002F2\u002Fw\u002F120",
      "note":{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fnote-1?imageView2\u002F2\u002Fw\u002F1080"},
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fnote-2?imageView2\u002F2\u002Fw\u002F1080"}
      ]}
    }</script>`;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/discovery/item/1')).toEqual([
      'https://ci.xiaohongshu.com/note-1?imageView2/2/w/1600/format/webp',
      'https://ci.xiaohongshu.com/note-2?imageView2/2/w/1600/format/webp',
    ]);
  });

  test('returns only note image urls when comments also include image lists', () => {
    const html = String.raw`<script>window.__INITIAL_STATE__={
      "comments":{"list":[{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fcomment-1?imageView2\u002F2\u002Fw\u002F1080"}
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
  });

  test('uses the last Xiaohongshu initial state script for note data', () => {
    const html = String.raw`
      <script>window.__INITIAL_STATE__={"comments":{"list":[{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F1\u002F2\u002Fcomment-token!comment"}
      ]}]}}</script>
      <script>window.__INITIAL_STATE__={"note":{"noteDetailMap":{"note-id":{"note":{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F1\u002F2\u002Fnote-token!note"}
      ]}}}}}</script>
    `;

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

  test('extracts note images from non-JSON initial state without scanning comments', () => {
    const html = String.raw`<script>
      window.__INITIAL_STATE__={
        comments:{list:[{imageList:[
          {urlDefault:"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F1\u002F2\u002Fcomment-token!comment"}
        ]}]},
        note:{noteDetailMap:{"note-id":{note:{imageList:[
          {urlDefault:"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F1\u002F2\u002Fnote-token-1!note"},
          {urlDefault:"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002F1\u002F2\u002Fnote-token-2!note"}
        ]}}}}
      };
    </script>`;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/discovery/item/note-id')).toEqual([
      'https://ci.xiaohongshu.com/note-token-1?imageView2/2/w/1600/format/webp',
      'https://ci.xiaohongshu.com/note-token-2?imageView2/2/w/1600/format/webp',
    ]);
  });

  test('falls back to rendered note image urls without returning static assets', () => {
    const html = String.raw`
      <link href="https://ci.xiaohongshu.com/public/css/allStyle.9f7ecdf.css" rel="stylesheet">
      <script src="https://ci.xiaohongshu.com/public/js/main.6ca7a2b.js"></script>
      <img src="https://ci.xiaohongshu.com/notes_uhdr/1040g3qg321u21abimu605n7vq32lgr60f359jpg?imageView2/2/w/1600/format/webp">
      <script>
        window.__SOME_STATE__ = {
          image: "https:\u002F\u002Fci.xiaohongshu.com\u002Fnotes_uhdr\u002F1040g3qg321u21abimu505n7vq32lgr60frp3v0g?imageView2\u002Fformat\u002Fpng"
        }
      </script>
    `;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/discovery/item/6a3fde3f0000000011005f29')).toEqual([
      'https://ci.xiaohongshu.com/notes_uhdr/1040g3qg321u21abimu605n7vq32lgr60f359jpg?imageView2/2/w/1600/format/webp',
      'https://ci.xiaohongshu.com/notes_uhdr/1040g3qg321u21abimu505n7vq32lgr60frp3v0g?imageView2/2/w/1600/format/webp',
    ]);
  });

  test('reports extraction diagnostics for each note image strategy', () => {
    const html = String.raw`
      <link href="https://ci.xiaohongshu.com/public/css/allStyle.9f7ecdf.css" rel="stylesheet">
      <img src="https://ci.xiaohongshu.com/notes_uhdr/rendered-token?imageView2/2/w/1600/format/webp">
    `;

    expect(inspectNoteExtraction(html, 'https://www.xiaohongshu.com/discovery/item/note-id')).toMatchObject({
      strategy: 'rendered-note-image',
      imageCount: 1,
      noteId: 'note-id',
      initialState: {
        payloadCount: 0,
        parsed: false,
        noteFound: false,
        imageCount: 0,
      },
      scopedInitialState: {
        imageCount: 0,
      },
      renderedNoteImages: {
        candidateCount: 1,
        imageCount: 1,
      },
    });
  });

  test('returns note image urls without unrelated ci.xiaohongshu.com urls when both exist', () => {
    const html = String.raw`<script>window.__INITIAL_STATE__={
      "banner":"https:\u002F\u002Fci.xiaohongshu.com\u002Fnot-note?imageView2\u002F2\u002Fw\u002F2160",
      "note":{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fnote-only?imageView2\u002F2\u002Fw\u002F1080"}
      ]}
    }</script>`;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/discovery/item/1')).toEqual([
      'https://ci.xiaohongshu.com/note-only?imageView2/2/w/1600/format/webp',
    ]);
  });

  test('rewrites ci.xiaohongshu.com image urls to the no-watermark png form', () => {
    const html = String.raw`<script>window.__INITIAL_STATE__={
      "banner":"https:\u002F\u002Fci.xiaohongshu.com\u002Fabc123\u002Fdef456?imageView2\u002F2\u002Fw\u002F2160"
    }</script>`;

    expect(findFirstImageUrl(html, 'https://www.xiaohongshu.com/discovery/item/1')).toBe(
      'https://ci.xiaohongshu.com/abc123/def456?imageView2/2/w/1600/format/webp',
    );
  });

  test('returns only note urls when note and unrelated no-watermark urls exist', () => {
    const html = String.raw`<script>window.__INITIAL_STATE__={
      "note":{"imageList":[
        {"urlDefault":"https:\u002F\u002Fsns-webpic-qc.xhscdn.com\u002Fwatermarked?imageView2\u002F2\u002Fw\u002F1080"}
      ]},
      "banner":"https:\u002F\u002Fci.xiaohongshu.com\u002Fno-watermark\u002Fimage?imageView2\u002F2\u002Fw\u002F2160"
    }</script>`;

    expect(findImageUrls(html, 'https://www.xiaohongshu.com/discovery/item/1')).toEqual([
      'https://ci.xiaohongshu.com/watermarked?imageView2/2/w/1600/format/webp',
    ]);
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

  test('ignores favicon candidates that cannot be used as image urls', () => {
    const html = '<meta content="https://ci.xiaohongshu.com/favicon.ico?imageView2/2/w/1600/format/webp" property="og:image">';

    expect(findFirstImageUrl(html, 'https://www.xiaohongshu.com/explore/1')).toBe('');
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
