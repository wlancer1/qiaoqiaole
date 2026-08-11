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

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, options);
  return { status: response.status, body: await response.json() };
}

function shareProject(projectId, headers, tags = ['其他']) {
  return request(`/api/projects/${projectId}/share`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
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
});

afterAll(async () => {
  serverProcess?.kill();
  await rm(root, { recursive: true, force: true });
});

describe('community API', () => {
  it('organizes projects in private folders and returns deleted-folder projects to uncategorized', async () => {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const secondHeaders = { authorization: `Bearer ${secondUserToken}`, 'content-type': 'application/json' };
    const created = await request('/api/project-folders', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '  动物作品  ' }),
    });
    expect(created.status).toBe(201);
    expect(created.body.folder.name).toBe('动物作品');

    const duplicate = await request('/api/project-folders', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '动物作品' }),
    });
    expect(duplicate.status).toBe(409);

    const moved = await request(`/api/projects/${projectId}/folder`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ folderId: created.body.folder.id }),
    });
    expect(moved.status).toBe(200);
    expect(moved.body.project.folderId).toBe(created.body.folder.id);

    const foreignFolder = await request('/api/project-folders', {
      method: 'POST',
      headers: secondHeaders,
      body: JSON.stringify({ name: '别人的文件夹' }),
    });
    expect(foreignFolder.status).toBe(201);
    const cannotMoveToForeignFolder = await request(`/api/projects/${projectId}/folder`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ folderId: foreignFolder.body.folder.id }),
    });
    expect(cannotMoveToForeignFolder.status).toBe(404);
    const cannotRenameForeignFolder = await request(`/api/project-folders/${foreignFolder.body.folder.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: '越权重命名' }),
    });
    expect(cannotRenameForeignFolder.status).toBe(404);

    const deleted = await request(`/api/project-folders/${created.body.folder.id}`, { method: 'DELETE', headers });
    expect(deleted.status).toBe(200);
    const projects = await request('/api/projects', { headers });
    expect(projects.body.projects.find((project) => project.id === projectId).folderId).toBeNull();
  });

  it('shares idempotently, counts one like, and persists comments', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const firstShare = await shareProject(projectId, headers, ['动物']);
    const secondShare = await shareProject(projectId, headers, ['动物']);
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
    expect(post.beadList).toEqual(firstShare.body.beadList);
    expect(post.tags).toEqual(['动物']);
  });

  it('requires preset tags for sharing and filters community posts by keyword or tag', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const secondHeaders = { authorization: `Bearer ${secondUserToken}` };
    const missingTags = await request(`/api/projects/${projectId}/share`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ tags: [] }),
    });
    expect(missingTags.status).toBe(400);

    const invalidTags = await shareProject(projectId, headers, ['不存在的标签']);
    expect(invalidTags.status).toBe(400);
    const updated = await shareProject(projectId, headers, ['动物', '动漫']);
    expect(updated.status).toBe(200);
    expect(updated.body.tags).toEqual(['动物', '动漫']);

    const secondProject = await request('/api/projects', {
      method: 'POST',
      headers: { ...secondHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '星空风景图', rows: 1, cols: 1, thumbnailImagePath: 'data:image/png;base64,AA==', canvasData: '[]' }),
    });
    const secondShared = await shareProject(secondProject.body.project.id, secondHeaders, ['风景']);
    expect(secondShared.status).toBe(200);

    const cannotEdit = await request(`/api/projects/${projectId}/community-tags`, {
      method: 'PATCH',
      headers: { ...secondHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['风景'] }),
    });
    expect(cannotEdit.status).toBe(404);
    const byTitle = await request('/api/community/posts?sort=latest&q=%E6%98%9F%E7%A9%BA');
    const byTag = await request('/api/community/posts?sort=latest&tags=%E5%8A%A8%E7%89%A9,%E9%A3%8E%E6%99%AF');
    const byTagName = await request('/api/community/posts?sort=latest&q=%E5%8A%A8%E7%89%A9');
    expect(byTitle.body.posts.map((post) => post.id)).toContain(secondProject.body.project.id);
    expect(byTag.body.posts.map((post) => post.id)).toEqual(expect.arrayContaining([projectId, secondProject.body.project.id]));
    expect(byTagName.body.posts.map((post) => post.id)).toContain(projectId);

    const edited = await request(`/api/projects/${projectId}/community-tags`, {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['文字'] }),
    });
    expect(edited.status).toBe(200);
    expect(edited.body.tags).toEqual(['文字']);
    const detail = await request(`/api/community/posts/${projectId}`);
    expect(detail.body.post.tags).toEqual(['文字']);
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
    const posts = await request('/api/community/posts?sort=latest');
    const savedProject = projects.body.projects.find((item) => item.id === created.body.project.id);
    const sharedPost = posts.body.posts.find((item) => item.id === created.body.project.id);

    expect(savedProject.sourceImage).toMatch(/^\/api\/project-assets\?path=/);
    expect(savedProject.thumbnailImage).toMatch(/^\/api\/project-assets\?path=/);
    expect(new URL(savedProject.sourceImage, 'http://127.0.0.1').searchParams.get('access')).toBeTruthy();
    expect(new URL(sharedPost.sourceImage, 'http://127.0.0.1').searchParams.get('access')).toBeNull();
    expect(new URL(sharedPost.sourceImage, 'http://127.0.0.1').searchParams.get('path')).toBe(new URL(savedProject.sourceImage, 'http://127.0.0.1').searchParams.get('path'));
    expect(new URL(sharedPost.thumbnailImage, 'http://127.0.0.1').searchParams.get('path')).toBe(new URL(savedProject.thumbnailImage, 'http://127.0.0.1').searchParams.get('path'));
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
  });
});
