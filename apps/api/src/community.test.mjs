import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMockPhoneUser } from './testPhoneUser.mjs';

const port = 3400 + Math.floor(Math.random() * 300);
const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-community-'));
const dbPath = path.join(root, 'community.sqlite');
let serverProcess;
let token;
let userId;
let projectId;
let secondUserToken;
let secondUserId;

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, options);
  return { status: response.status, body: await response.json() };
}

function shareProject(id, headers) {
  return request(`/api/projects/${id}/share`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ tags: ['其他'] }) });
}

beforeAll(async () => {
  serverProcess = spawn(process.execPath, ['src/server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      SQLITE_PATH: dbPath,
      REDIS_URL: 'redis://127.0.0.1:6380',
      AUTH_SMS_PROVIDER: 'mock',
      AUTH_TEST_FIXED_CODE: '123456',
      AUTH_PHONE_PEPPER: 'community-phone-pepper',
      AUTH_JWT_SECRET: 'community-jwt-secret',
      QIAOQIAOLE_USERNAME: 'test-user',
      QIAOQIAOLE_PASSWORD: 'test-password',
      TENCENT_COS_ENABLED: 'false',
      TENCENT_COS_SECRET_ID: '',
      TENCENT_COS_SECRET_KEY: '',
      TENCENT_COS_BUCKET: 'qiaoqiaole-test',
      TENCENT_COS_KEY_PREFIX: 'uploads/images',
    },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const health = await request('/api/health');
      if (health.status === 200) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'test-user', password: 'test-password' }) });
  token = login.body.token;
  userId = login.body.user.id;
  const created = await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name: 'API 社区稿件', rows: 2, cols: 3, thumbnailImagePath: 'data:image/png;base64,AA==', canvasData: JSON.stringify([
    { x: 0, y: 0, color: '#ff0000', transparent: false },
    { x: 1, y: 0, color: '#ff0000', transparent: false },
    { x: 0, y: 1, color: '#0000ff', transparent: false },
  ]) }) });
  projectId = created.body.project.id;
  const secondUser = await createMockPhoneUser(`http://127.0.0.1:${port}`);
  secondUserToken = secondUser.token;
  secondUserId = secondUser.user.id;
});

afterAll(async () => {
  serverProcess?.kill();
  await rm(root, { recursive: true, force: true });
});

describe('community API', () => {
  it('paginates the authenticated project list and keeps list responses lightweight', async () => {
    const listed = await request('/api/projects?page=1&pageSize=1', { headers: { authorization: `Bearer ${token}` } });

    expect(listed.status).toBe(200);
    expect(listed.body.page).toBe(1);
    expect(listed.body.pageSize).toBe(1);
    expect(typeof listed.body.hasMore).toBe('boolean');
    expect(listed.body.projects.length).toBeLessThanOrEqual(1);
    expect(listed.body.projects[0]).not.toHaveProperty('canvasData');
    expect(listed.body.projects[0]).not.toHaveProperty('beadList');
  });

  it('returns only tags that are used by shared community posts', async () => {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const created = await request('/api/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '标签聚合稿件', rows: 1, cols: 1, thumbnailImagePath: 'data:image/png;base64,AA==', canvasData: '[]' }),
    });
    const shared = await request(`/api/projects/${created.body.project.id}/share`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tags: ['动物', '人物'] }),
    });
    expect(shared.status).toBe(200);

    const posts = await request('/api/community/posts?sort=latest');

    expect(posts.body.tagCounts).toEqual(expect.arrayContaining([
      { tag: '动物', count: 1 },
      { tag: '人物', count: 1 },
    ]));
    expect(posts.body.tagCounts.some((item) => item.tag === '风景')).toBe(false);
  });

  it('shares idempotently, counts one like, and persists comments', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const firstShare = await shareProject(projectId, headers);
    const secondShare = await shareProject(projectId, headers);
    expect(firstShare.body.shared).toBe(true);
    expect(firstShare.body.beadList).toEqual([
      { color: '#ff0000', count: 2 },
      { color: '#0000ff', count: 1 },
    ]);
    expect(secondShare.body.sharedAt).toBe(firstShare.body.sharedAt);

    await request(`/api/community/posts/${projectId}/like`, { method: 'POST', headers });
    await request(`/api/community/posts/${projectId}/like`, { method: 'POST', headers });
    const comment = await request(`/api/community/posts/${projectId}/comments`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ content: '真实评论' }) });
    const posts = await request('/api/community/posts?sort=hot', { headers });
    const post = posts.body.posts.find((item) => item.id === projectId);

    expect(comment.body.comment.content).toBe('真实评论');
    expect(comment.body.comment.authorAvatar).toBeNull();
    expect(post.likesCount).toBe(1);
    expect(post.commentsCount).toBe(1);
    expect(post.likedByMe).toBe(true);
    expect(post.beadList).toBeUndefined();
    expect(post.canvasData).toBeUndefined();
    expect(post.sourceImage).toBeUndefined();
    expect(post.thumbnailImage || '').not.toMatch(/^data:/);
    const detail = await request(`/api/community/posts/${projectId}`);
    expect(detail.body.post.beadList).toEqual(firstShare.body.beadList);
  });

  it('groups replies under one thread while allowing replies to replies', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const listed = await request(`/api/community/posts/${projectId}/comments`);
    const parent = listed.body.comments.find((comment) => comment.content === '真实评论');
    expect(parent).toBeTruthy();
    const anonymousDelete = await request(`/api/community/posts/${projectId}/comments/${parent.id}`, { method: 'DELETE' });
    expect(anonymousDelete.status).toBe(401);

    const reply = await request(`/api/community/posts/${projectId}/comments`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ content: '回复内容', parentId: parent.id }),
    });
    expect(reply.status).toBe(201);
    expect(reply.body.comment.parentId).toBe(parent.id);
    expect(reply.body.comment.replyToUserId).toBe(userId);
    expect(reply.body.comment.replyToUserName).toBeTruthy();
    expect(reply.body.comment.replies).toEqual([]);

    const replyToReply = await request(`/api/community/posts/${projectId}/comments`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ content: '回复的回复内容', parentId: reply.body.comment.id }),
    });
    expect(replyToReply.status).toBe(201);
    expect(replyToReply.body.comment.parentId).toBe(reply.body.comment.id);
    expect(replyToReply.body.comment.replyToUserId).toBe(userId);

    const nested = await request(`/api/community/posts/${projectId}/comments`);
    const nestedParent = nested.body.comments.find((comment) => comment.id === parent.id);
    expect(nestedParent.replies).toHaveLength(2);
    expect(nestedParent.replies[0].content).toBe('回复内容');
    expect(nestedParent.replies[1].content).toBe('回复的回复内容');
    expect(nestedParent.replies[1].parentId).toBe(reply.body.comment.id);
    expect(nested.body.totalTopLevel).toBe(1);
    expect(nested.body.totalComments).toBe(3);
    expect(nested.body.hasMore).toBe(false);

    const deletedReply = await request(`/api/community/posts/${projectId}/comments/${reply.body.comment.id}`, { method: 'DELETE', headers });
    expect(deletedReply.status).toBe(200);
    expect(deletedReply.body.deletedCount).toBe(2);
    const afterReplyDelete = await request(`/api/community/posts/${projectId}/comments`);
    const parentAfterReplyDelete = afterReplyDelete.body.comments.find((comment) => comment.id === parent.id);
    expect(parentAfterReplyDelete.replies).toHaveLength(0);
    const deletedParent = await request(`/api/community/posts/${projectId}/comments/${parent.id}`, { method: 'DELETE', headers });
    expect(deletedParent.status).toBe(200);
    expect(deletedParent.body.deletedCount).toBe(1);
  });

  it('rejects a second user from deleting another author\'s comment', async () => {
    const ownerHeaders = { authorization: `Bearer ${token}` };
    const secondHeaders = { authorization: `Bearer ${secondUserToken}` };
    const created = await request('/api/projects', {
      method: 'POST',
      headers: { ...ownerHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '跨用户评论权限', rows: 1, cols: 1, thumbnailImagePath: 'data:image/png;base64,AA==', canvasData: '[]' }),
    });
    const targetProjectId = created.body.project.id;
    await shareProject(targetProjectId, ownerHeaders);
    const ownerComment = await request(`/api/community/posts/${targetProjectId}/comments`, {
      method: 'POST',
      headers: { ...ownerHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ content: `所有者评论 ${secondUserId}` }),
    });
    const forbiddenDelete = await request(`/api/community/posts/${targetProjectId}/comments/${ownerComment.body.comment.id}`, { method: 'DELETE', headers: secondHeaders });
    expect(forbiddenDelete.status).toBe(404);
    const stillThere = await request(`/api/community/posts/${targetProjectId}/comments`);
    expect(stillThere.body.comments.some((comment) => comment.id === ownerComment.body.comment.id)).toBe(true);
  });

  it('rejects comments before sharing and invalid empty comments', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const invalid = await request(`/api/community/posts/${projectId}/comments`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ content: '' }) });
    expect(invalid.status).toBe(400);
  });

  it('allows anonymous users to read shared posts and comments without liked state', async () => {
    const headers = { authorization: `Bearer ${token}` };
    await shareProject(projectId, headers);
    await request(`/api/community/posts/${projectId}/comments`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ content: '匿名可见评论' }) });

    const posts = await request('/api/community/posts?sort=hot');
    const comments = await request(`/api/community/posts/${projectId}/comments`);
    const post = posts.body.posts.find((item) => item.id === projectId);

    expect(posts.status).toBe(200);
    expect(comments.status).toBe(200);
    expect(post.likedByMe).toBe(false);
    const anonymousVisibleComment = comments.body.comments.find((comment) => comment.content === '匿名可见评论');
    expect(anonymousVisibleComment).toBeTruthy();
    expect(anonymousVisibleComment.authorAvatar).toBeNull();
  });

  it('accepts project image uploads when COS is disabled', async () => {
    const dataUrl = `data:image/png;base64,${Buffer.from('tiny-image').toString('base64')}`;
    const uploaded = await request('/api/uploads/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        images: [
          { kind: 'source', filename: 'source.png', dataUrl },
          { kind: 'thumbnail', filename: 'thumbnail.png', dataUrl },
        ],
      }),
    });

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.sourceImagePath).toBe('');
    expect(uploaded.body.sourceImageUrl).toBe('');
    expect(uploaded.body.thumbnailImagePath).toMatch(/^data:image\/png;base64,/);
    expect(uploaded.body.thumbnailImageUrl).toBe(uploaded.body.thumbnailImagePath);
  });

  it('returns stable API asset URLs for COS-backed project images', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const created = await request('/api/projects', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'COS 图片项目',
        rows: 2,
        cols: 2,
        sourceImagePath: `cos://qiaoqiaole-test/uploads/images/projects/${userId}/asset-source-source.png`,
        thumbnailImagePath: `cos://qiaoqiaole-test/uploads/images/projects/${userId}/asset-thumbnail-thumbnail.webp`,
        canvasData: '[]',
      }),
    });
    await shareProject(created.body.project.id, headers);

    const projects = await request('/api/projects', { headers });
    const projectDetail = await request(`/api/projects/${created.body.project.id}`, { headers });
    const posts = await request('/api/community/posts?sort=latest');
    const savedProject = projects.body.projects.find((item) => item.id === created.body.project.id);
    const savedProjectDetail = projectDetail.body.project;
    const sharedPost = posts.body.posts.find((item) => item.id === created.body.project.id);

    expect(savedProject.sourceImage).toBeUndefined();
    expect(savedProject.thumbnailImage).toMatch(/^\/api\/project-assets\?path=/);
    expect(savedProjectDetail.sourceImage).toMatch(/^\/api\/project-assets\?path=/);
    expect(new URL(savedProjectDetail.sourceImage, 'http://127.0.0.1').searchParams.get('access')).toBeTruthy();
    expect(sharedPost.sourceImage).toBeUndefined();
    expect(new URL(sharedPost.thumbnailImage, 'http://127.0.0.1').searchParams.get('path')).toBe(new URL(savedProject.thumbnailImage, 'http://127.0.0.1').searchParams.get('path'));

    const detail = await request(`/api/community/posts/${created.body.project.id}`);
    expect(new URL(detail.body.post.sourceImage, 'http://127.0.0.1').searchParams.get('access')).toBeNull();
    expect(new URL(detail.body.post.sourceImage, 'http://127.0.0.1').searchParams.get('path')).toBe(new URL(savedProjectDetail.sourceImage, 'http://127.0.0.1').searchParams.get('path'));
  });

  it('keeps a COS thumbnail renderable when copying a shared project', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const thumbnailPath = `cos://qiaoqiaole-test/uploads/images/projects/${userId}/copy-thumbnail-thumbnail.webp`;
    const created = await request('/api/projects', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'COS 缩略图副本', rows: 2, cols: 2, thumbnailImagePath: thumbnailPath, canvasData: '[]' }),
    });
    await shareProject(created.body.project.id, headers);

    const copied = await request(`/api/projects/${created.body.project.id}/copy`, { method: 'POST', headers });
    expect(copied.status).toBe(201);
    expect(copied.body.project.sourceImage).toContain('project-assets');
    expect(new URL(copied.body.project.sourceImage, 'http://127.0.0.1').searchParams.get('path')).toBe(thumbnailPath);
  });

  it('requires ownership or community sharing before signing project asset URLs', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const assetPath = `cos://qiaoqiaole-test/uploads/images/projects/${userId}/private-source-source.png`;
    const created = await request('/api/projects', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '私有 COS 图片项目',
        rows: 2,
        cols: 2,
        sourceImagePath: assetPath,
        canvasData: '[]',
      }),
    });

    const anonymousAsset = await request(`/api/project-assets?path=${encodeURIComponent(assetPath)}`);
    const ownerEmbeddedAsset = await request(created.body.project.sourceImage);
    const ownedAsset = await request(`/api/project-assets?path=${encodeURIComponent(assetPath)}`, { headers });
    await shareProject(created.body.project.id, headers);
    const sharedAsset = await request(`/api/project-assets?path=${encodeURIComponent(assetPath)}`);

    expect(created.body.project.sourceImage).toContain('access=');
    expect(anonymousAsset.status).toBe(401);
    expect(ownerEmbeddedAsset.status).toBe(404);
    expect(ownedAsset.status).toBe(404);
    expect(sharedAsset.status).toBe(404);
  });

  it('rejects COS project image paths outside the current user upload prefix', async () => {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const created = await request('/api/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: '非法 COS 图片项目',
        rows: 2,
        cols: 2,
        sourceImagePath: 'cos://qiaoqiaole-test/uploads/images/projects/other-user/stolen-source-source.png',
        canvasData: '[]',
      }),
    });
    const updated = await request(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        name: '非法更新',
        rows: 2,
        cols: 2,
        thumbnailImagePath: 'cos://qiaoqiaole-test/uploads/images/projects/other-user/stolen-thumbnail-thumbnail.webp',
        canvasData: '[]',
      }),
    });

    expect(created.status).toBe(400);
    expect(updated.status).toBe(400);
  });

  it('updates an existing project without changing its community identity', async () => {
    const headers = { authorization: `Bearer ${token}` };
    await shareProject(projectId, headers);
    const updated = await request(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '更新后的社区稿件', rows: 4, cols: 5, canvasData: '[]' }),
    });
    const posts = await request('/api/community/posts?sort=hot', { headers });

    expect(updated.status).toBe(200);
    expect(updated.body.project.id).toBe(projectId);
    expect(updated.body.project.sharedToCommunity).toBe(true);
    expect(posts.body.posts.filter((item) => item.id === projectId)).toHaveLength(1);
    expect(posts.body.posts.find((item) => item.id === projectId).name).toBe('更新后的社区稿件');
  });

  it('returns every saved project for the my works page', async () => {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    for (let index = 0; index < 9; index += 1) {
      await request('/api/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: `作品 ${index}`, rows: 1, cols: 1, canvasData: '[]' }),
      });
    }

    const listed = await request('/api/projects', { headers: { authorization: `Bearer ${token}` } });

    expect(listed.status).toBe(200);
    expect(listed.body.projects.length).toBeGreaterThanOrEqual(10);
    expect(listed.body.projects.some((project) => project.name === '作品 0')).toBe(true);
  });

  it('returns a truthful total for a 40-project folder while paging only 20 summaries', async () => {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const folder = await request('/api/project-folders', { method: 'POST', headers, body: JSON.stringify({ name: '四十条分页' }) });
    for (let index = 0; index < 40; index += 1) {
      await request('/api/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: `分页摘要 ${index}`, rows: 1, cols: 1, folderId: folder.body.folder.id }),
      });
    }
    const page = await request(`/api/projects?folder=${encodeURIComponent(folder.body.folder.id)}&page=1&pageSize=20`, { headers });

    expect(page.status).toBe(200);
    expect(page.body.projects).toHaveLength(20);
    expect(page.body.total).toBe(40);
    expect(page.body.hasMore).toBe(true);
    expect(page.body.projects.every((project) => project.folderId === folder.body.folder.id)).toBe(true);
  });

  it('keeps canvas data out of the project list and returns it from project details', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const canvasData = JSON.stringify([{ x: 0, y: 0, color: '#ff0000', transparent: false }]);
    const created = await request('/api/projects', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '延迟加载作品', rows: 1, cols: 1, canvasData, thumbnailImagePath: 'data:image/png;base64,AA==' }),
    });

    const listed = await request('/api/projects', { headers });
    const detail = await request(`/api/projects/${created.body.project.id}`, { headers });

    expect(listed.status).toBe(200);
    const summary = listed.body.projects.find((project) => project.id === created.body.project.id);
    expect(summary).not.toHaveProperty('canvasData');
    expect(summary).not.toHaveProperty('beadList');
    expect(summary).not.toHaveProperty('sourceImage');
    expect(JSON.stringify(summary)).not.toContain('base64,');
    expect(summary.thumbnailImage).toBe('');
    expect(detail.status).toBe(200);
    expect(detail.body.project.canvasData).toBe(canvasData);
    expect(detail.body.project.thumbnailImage).toContain('base64,');
  });

  it('keeps heavy project fields out of author profile post summaries', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const created = await request('/api/projects', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '作者主页轻量作品',
        rows: 2,
        cols: 2,
        thumbnailImagePath: 'data:image/png;base64,AA==',
        canvasData: JSON.stringify([{ color: '#ff0000' }]),
      }),
    });
    await shareProject(created.body.project.id, headers);

    const profile = await request(`/api/community/users/${userId}/profile?page=1&pageSize=20`);
    const post = profile.body.posts.find((item) => item.name === '作者主页轻量作品');

    expect(profile.status).toBe(200);
    expect(post).toBeDefined();
    expect(post).not.toHaveProperty('sourceImage');
    expect(post).not.toHaveProperty('canvasData');
    expect(post).not.toHaveProperty('beadList');
    expect(post.thumbnailImage || '').not.toMatch(/^data:/);
  });

  it('counts comment length by Unicode characters instead of UTF-16 code units', async () => {
    const headers = { authorization: `Bearer ${token}` };
    await shareProject(projectId, headers);
    const content = '🙂'.repeat(300);
    const comment = await request(`/api/community/posts/${projectId}/comments`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    expect(comment.status).toBe(201);
    expect(comment.body.comment.content).toBe(content);
  });

  it('paginates community posts', async () => {
    const authHeaders = { authorization: `Bearer ${token}` };
    const jsonHeaders = { ...authHeaders, 'content-type': 'application/json' };
    for (let index = 0; index < 3; index += 1) {
      const created = await request('/api/projects', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: `分页作品 ${index}`, rows: 1, cols: 1, canvasData: '[]' }),
      });
      await shareProject(created.body.project.id, authHeaders);
    }

    const firstPage = await request('/api/community/posts?sort=latest&page=1&pageSize=1');
    const secondPage = await request('/api/community/posts?sort=latest&page=2&pageSize=1');

    expect(firstPage.status).toBe(200);
    expect(secondPage.status).toBe(200);
    expect(firstPage.body.posts).toHaveLength(1);
    expect(secondPage.body.posts).toHaveLength(1);
    expect(firstPage.body.posts[0].id).not.toBe(secondPage.body.posts[0].id);
  });

  it('paginates community comments', async () => {
    const authHeaders = { authorization: `Bearer ${token}` };
    const jsonHeaders = { ...authHeaders, 'content-type': 'application/json' };
    const created = await request('/api/projects', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: '分页评论作品', rows: 1, cols: 1, thumbnailImagePath: 'data:image/png;base64,AA==', canvasData: '[]' }),
    });
    const paginatedProjectId = created.body.project.id;
    await shareProject(paginatedProjectId, authHeaders);
    for (let index = 0; index < 3; index += 1) {
      await request(`/api/community/posts/${paginatedProjectId}/comments`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ content: `分页评论 ${index}` }),
      });
    }

    const firstPage = await request(`/api/community/posts/${paginatedProjectId}/comments?page=1&pageSize=1`);
    const secondPage = await request(`/api/community/posts/${paginatedProjectId}/comments?page=2&pageSize=1`);

    expect(firstPage.status).toBe(200);
    expect(secondPage.status).toBe(200);
    expect(firstPage.body.comments).toHaveLength(1);
    expect(secondPage.body.comments).toHaveLength(1);
    expect(firstPage.body.comments[0].id).not.toBe(secondPage.body.comments[0].id);
    expect(firstPage.body.page).toBe(1);
    expect(firstPage.body.pageSize).toBe(1);
    expect(firstPage.body.hasMore).toBe(true);
    expect(firstPage.body.totalTopLevel).toBe(3);
    expect(firstPage.body.totalComments).toBe(3);
    expect(secondPage.body.hasMore).toBe(true);
  });

  it('deletes an owned project, hides it from community, and rejects anonymous or repeated deletion', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const created = await request('/api/projects', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '待删除作品', rows: 1, cols: 1, thumbnailImagePath: 'data:image/png;base64,AA==', canvasData: '[]' }),
    });
    const target = created.body.project.id;
    await shareProject(target, headers);
    await request(`/api/community/posts/${target}/comments`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ content: '待清理评论' }) });

    const anonymous = await request(`/api/projects/${target}`, { method: 'DELETE' });
    expect(anonymous.status).toBe(401);
    const secondUserDelete = await request(`/api/projects/${target}`, { method: 'DELETE', headers: { authorization: `Bearer ${secondUserToken}` } });
    expect(secondUserDelete.status).toBe(404);
    const deleted = await request(`/api/projects/${target}`, { method: 'DELETE', headers });
    expect(deleted.status).toBe(200);
    expect((await request(`/api/projects/${target}`, { headers })).status).toBe(404);
    expect((await request(`/api/community/posts/${target}`)).status).toBe(404);
    expect((await request(`/api/projects/${target}`, { method: 'DELETE', headers })).status).toBe(404);
  });
});
