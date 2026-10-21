import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-editor-fabric-'));
const port = 6400 + Math.floor(Math.random() * 300);
let server; let token;
async function request(method, url, body) {
 const res = await fetch('http://127.0.0.1:' + port + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
 return { status: res.status, body: await res.json() };
}
beforeAll(async () => {
 server = spawn(process.execPath, ['src/server.mjs'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(port), SQLITE_PATH: path.join(root, 'test.sqlite'), AUTH_JWT_SECRET: 'fabric-review-test-jwt-secret', QIAOQIAOLE_USERNAME: 'fabric-test', QIAOQIAOLE_PASSWORD: 'fabric-test-password', TENCENT_COS_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
 let serverLog = ''; server.stderr.on('data', chunk => { serverLog += chunk; });
 for (let i = 0; i < 300; i++) { try { if ((await request('GET', '/api/health')).status === 200) break; } catch {} await new Promise(r => setTimeout(r, 50)); }
 if (server.exitCode !== null) throw new Error('Test API failed to start: ' + serverLog);
 token = (await request('POST', '/api/auth/login', { username: 'fabric-test', password: 'fabric-test-password' })).body.token;
 expect(token).toBeTruthy();
}, 30000);
afterAll(async () => { server?.kill(); await rm(root, { recursive: true, force: true }); });
describe('editor fabric warehouse API', () => {
 it('round-trips calibration without treating it as stock and preserves it on warehouse edits', async () => {
  const created = await request('POST', '/api/fabrics', { name: '新上传布料', color: '#d9ad45', image: 'data:image/jpeg;base64,AA==', stockMode: 'own', sampleWidthMm: 150, widthMm: null, heightMm: null, availableAreaMm2: null });
  expect(created.status).toBe(201);
  expect(created.body.fabric).toMatchObject({ sampleWidthMm: 150, stockMode: 'own', availableAreaMm2: null, widthMm: null, heightMm: null });
  const id = created.body.fabric.id;
  const edited = await request('PATCH', '/api/fabrics/' + id, { name: '已改名' });
  expect(edited.status).toBe(200);
  expect(edited.body.fabric.sampleWidthMm).toBe(150);
  const list = await request('GET', '/api/fabrics');
  expect(list.body.fabrics.find(f => f.id === id)).toMatchObject({ name: '已改名', sampleWidthMm: 150, availableAreaMm2: null });
 });
 it('stores only the separately entered area as the available balance', async () => {
  const response = await request('POST', '/api/fabrics', { name: '库存已核实', stockMode: 'area', sampleWidthMm: 64, availableAreaMm2: 800000 });
  expect(response.status).toBe(201);
  expect(response.body.fabric).toMatchObject({ sampleWidthMm: 64, availableAreaMm2: 800000, widthMm: null, heightMm: null });
 });
});

 describe('preset fabric identity and stock', () => {
  it('creates lazily and idempotently, then preserves identity and pattern calibration on stock entry', async () => {
   const initial = await request('GET', '/api/fabrics');
   expect(initial.body.fabrics.filter(f => f.presetId)).toHaveLength(0);
   const first = await request('POST', '/api/fabrics/presets/ivory');
   expect(first.status).toBe(201);
   expect(first.body.fabric).toMatchObject({presetId:'ivory',stockMode:'own',availableAreaMm2:null,sampleWidthMm:64});
   const second = await request('POST', '/api/fabrics/presets/ivory');
   expect(second.body.fabric.id).toBe(first.body.fabric.id);
   const path = '/api/fabrics/' + first.body.fabric.id;
   const edited = await request('PATCH', path, {stockMode:'size',widthMm:500,heightMm:350,quantity:2,availableAreaMm2:350000});
   expect(edited.status).toBe(200);
   expect(edited.body.fabric).toMatchObject({id:first.body.fabric.id,presetId:'ivory',sampleWidthMm:64,widthMm:500,heightMm:350,quantity:2,availableAreaMm2:350000});
   const again = await request('POST', '/api/fabrics/presets/ivory');
   expect(again.body.fabric.availableAreaMm2).toBe(350000);
   expect((await request('PATCH', path, {stockMode:'size',widthMm:0,heightMm:350,quantity:1})).status).toBe(400);
   expect((await request('POST', '/api/fabrics/presets/nonexistent')).status).toBe(404);
   const list = await request('GET', '/api/fabrics');
   expect(list.body.fabrics.filter(f => f.presetId === 'ivory')).toHaveLength(1);
  });
 });

describe('stock balance regressions', () => {
 it('does not restore consumed stock on a name-only patch and rejects duplicate consumption rows', async () => {
  const created = await request('POST','/api/fabrics',{name:'余量测试',stockMode:'size',widthMm:500,heightMm:350,quantity:1});
  const id = created.body.fabric.id;
  const consume = await request('POST','/api/fabrics/consume',{operationId:'review-1',items:[{fabricId:id,actualAreaMm2:1000}]});
  expect(consume.status).toBe(200);
  const rename = await request('PATCH','/api/fabrics/'+id,{name:'只改名称'});
  expect(rename.body.fabric.availableAreaMm2).toBe(174000);
  const repeated = await request('POST','/api/fabrics/consume',{operationId:'review-1',items:[{fabricId:id,actualAreaMm2:1000}]});
  expect(repeated.body.idempotent).toBe(true);
  const duplicate = await request('POST','/api/fabrics/consume',{operationId:'review-2',items:[{fabricId:id,actualAreaMm2:1000},{fabricId:id,actualAreaMm2:1000}]});
  expect(duplicate.status).toBe(400);
  const after = await request('PATCH','/api/fabrics/'+id,{note:'仍保留已扣减余量'});
  expect(after.body.fabric.availableAreaMm2).toBe(174000);
 });
});

describe('paginated fabric catalog', () => {
 it('returns bounded summary pages, excludes embedded images and loads selected detail separately', async () => {
  for(let i=0;i<18;i++) await request('POST','/api/fabrics',{name:'分页测试'+i,stockMode:'own',image:'data:image/png;base64,AAAA'});
  const first=await request('GET','/api/fabrics/browse?page=1&pageSize=16&q='+encodeURIComponent('分页测试'));
  expect(first.status).toBe(200);expect(first.body.fabrics).toHaveLength(16);expect(first.body.hasMore).toBe(true);
  expect(JSON.stringify(first.body)).not.toContain('base64');expect(JSON.stringify(first.body).length).toBeLessThan(16000);
  const second=await request('GET','/api/fabrics/browse?page=2&pageSize=16&q='+encodeURIComponent('分页测试'));
  expect(second.body.fabrics).toHaveLength(2);expect(second.body.hasMore).toBe(false);
  expect(new Set([...first.body.fabrics,...second.body.fabrics].map(f=>f.id)).size).toBe(18);
  const chosen=first.body.fabrics[0];
  const detail=await request('GET','/api/fabrics/'+chosen.id);
  expect(detail.body.fabric.image).toContain('base64');
  const image=await fetch('http://127.0.0.1:'+port+chosen.image);
  expect(image.status).toBe(200);expect(image.headers.get('content-type')).toBe('image/png');
  expect((await fetch('http://127.0.0.1:'+port+chosen.image.replace(/sig=.*/, 'sig=invalid'))).status).toBe(403);
  const capped=await request('GET','/api/fabrics/browse?pageSize=999999');expect(capped.body.pageSize).toBe(48);
 });
});

it('isolates preset identity, balances and edits between accounts', async () => {
 const own = await request('POST','/api/fabrics/presets/sage');
 const {default:Database} = await import('better-sqlite3');
 const db=new Database(path.join(root,'test.sqlite'));
 db.prepare('INSERT INTO users (id,username,password_hash,salt,created_at) VALUES (?,?,?,?,?)').run('review-other','review-other','unused','unused',new Date().toISOString());db.close();
 const parts=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:'review-other',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')];
 const other=parts.join('.')+'.'+createHmac('sha256','fabric-review-test-jwt-secret').update(parts.join('.')).digest('base64url');
 const original=token;
 try {
  token=other;
  const second=await request('POST','/api/fabrics/presets/sage');expect(second.status).toBe(201);expect(second.body.fabric.id).not.toBe(own.body.fabric.id);
  expect((await request('PATCH','/api/fabrics/'+own.body.fabric.id,{availableAreaMm2:1000})).status).toBe(404);
  expect((await request('GET','/api/fabrics/'+own.body.fabric.id)).status).toBe(404);
  const page=await request('GET','/api/fabrics/browse');expect(page.body.fabrics.map(f=>f.id)).toEqual([second.body.fabric.id]);
 } finally {token=original;}
});
