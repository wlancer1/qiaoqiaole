import { describe, expect, it, vi } from 'vitest';
import { createEditorWarehouseFabric } from './editorFabricPersistence';
describe('editor warehouse persistence', () => {
 it('keeps texture calibration separate from real inventory dimensions', async () => {
  const request = vi.fn(async (_path: string, _options?: RequestInit) => ({ fabric: { id: 'new' } }));
  await createEditorWarehouseFabric(request as any, 'token', { name: 'photo', color: '#abcdef', image: 'data:image/jpeg;base64,AA==', sampleWidthMm: 150, areaCm2: '' });
  const body = JSON.parse(request.mock.calls[0][1]!.body as string);
  expect(body).toMatchObject({ stockMode: 'own', sampleWidthMm: 150, widthMm: null, heightMm: null, availableAreaMm2: null });
 });
 it('uses only explicitly entered real stock for the area balance', async () => {
  const request = vi.fn(async (_path: string, _options?: RequestInit) => ({ fabric: { id: 'new' } }));
  await createEditorWarehouseFabric(request as any, 'token', { name: 'cloth', color: '#abcdef', sampleWidthMm: 64, areaCm2: '8000' });
  expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toMatchObject({ stockMode: 'area', availableAreaMm2: 800000, sampleWidthMm: 64 });
 });
 it.each(['-1', 'NaN', '0', 'Infinity'])('rejects invalid stock %s before creating inventory', async (areaCm2) => {
  const request = vi.fn();
  await expect(createEditorWarehouseFabric(request, 'token', { name: 'cloth', color: '#abcdef', areaCm2 })).rejects.toThrow('实际库存面积');
  expect(request).not.toHaveBeenCalled();
 });
 it('requires authentication and propagates failure rather than pretending to save locally', async () => {
  const request = vi.fn().mockRejectedValue(new Error('offline'));
  const input = { name: 'cloth', color: '#abcdef', areaCm2: '' };
  await expect(createEditorWarehouseFabric(request, '', input)).rejects.toThrow('登录');
  expect(request).not.toHaveBeenCalled();
  await expect(createEditorWarehouseFabric(request, 'token', input)).rejects.toThrow('offline');
 });
});
