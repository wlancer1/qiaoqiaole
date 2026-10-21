import { afterEach, describe, expect, it, vi } from 'vitest';
import { area, pointBounds, validatePiece } from './model';
import { BASE_SHAPE_GROUPS, placeShapePieces, readShapeTemplates, shapeChoices, toShapeTemplate, validShapePlacement } from './shapeLibrary';

afterEach(() => vi.unstubAllGlobals());
describe('shape library', () => {
  it('exposes 53 individual builtin cutting outlines grouped by their actual usage', () => {
    const choices = shapeChoices('base', []);
    expect(choices).toHaveLength(53);
    expect(new Set(choices.map((c) => c.id)).size).toBe(choices.length);
    expect(new Set(choices.map((c) => c.name)).size).toBe(choices.length);
    expect(new Set(choices.map((c) => c.group))).toEqual(new Set(BASE_SHAPE_GROUPS.map((group) => group.id)));
    for (const name of ['等边三角形', '不等边三角形', '直角梯形', '细长菱形', '长条形', '七边形', '十边形', '十二边形', 'L形', 'T形', '半圆环', '四分之一圆环', '正方形', '长方形', '直角三角形', '梯形', '半圆形', '贝壳形', '六瓣花', '蝴蝶', '爱心']) {
      expect(choices.some((choice) => choice.name === name)).toBe(true);
    }
    expect(shapeChoices('mine', [])).toEqual([]);
  });
  it('every builtin shape is closed implicitly, non-self-intersecting, scalable, and usable as one fabric piece', () => {
    const choices = shapeChoices('base', []);
    for (const choice of choices) {
      expect(choice.polygons, choice.name).toHaveLength(1);
      const [points] = choice.polygons;
      expect(points.length, choice.name).toBeGreaterThanOrEqual(3);
      expect(validatePiece(points), choice.name).toBe('');
      expect(area(points), choice.name).toBeGreaterThan(1);
      const bounds = pointBounds(points);
      expect(bounds.width, choice.name).toBeGreaterThanOrEqual(5);
      expect(bounds.height, choice.name).toBeGreaterThanOrEqual(5);
      const pieces = placeShapePieces(choice, { width: 75, height: 120, seam: 5, rotation: 0 }, { x: 160, y: 190 }, 'A');
      expect(pieces, choice.name).toHaveLength(1);
      expect(validatePiece(pieces[0].points), choice.name).toBe('');
      expect(pointBounds(pieces[0].points).width, choice.name).toBeCloseTo(75);
      expect(pointBounds(pieces[0].points).height, choice.name).toBeCloseTo(120);
      expect(pieces[0]).toMatchObject({ name: choice.name, materialId: 'A', seamMm: 5 });
    }
  });
  it('migrates legacy templates and discards invalid saved outlines', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify([{ name: '旧形状', points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 0, y: 120 }] }, { name: '损坏', points: [] }]) });
    const list = readShapeTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: expect.any(String), name: '旧形状' });
    expect(shapeChoices('mine', list)[0].templateId).toBe(list[0].id);
  });
  it('stores independent reusable outlines normalized to their origin', () => {
    const input = [{ x: 10, y: 20 }, { x: 90, y: 20 }, { x: 10, y: 140 }];
    const template = toShapeTemplate('叶片', input);
    expect(pointBounds(template.points)).toMatchObject({ x: 0, y: 0, width: 80, height: 120 });
    expect(input[0]).toEqual({ x: 10, y: 20 });
  });
  it('places a template at the requested size, seam and center', () => {
    const template = toShapeTemplate('三角', [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 0, y: 120 }]);
    const [piece] = placeShapePieces(shapeChoices('mine', [template])[0], { width: 100, height: 150, seam: 5, rotation: 0 }, { x: 200, y: 200 }, 'cotton');
    expect(pointBounds(piece.points)).toMatchObject({ x: 150, y: 125, width: 100, height: 150 });
    expect(piece).toMatchObject({ materialId: 'cotton', seamMm: 5, name: '三角' });
  });
  it('rotates a combination around its shared center and keeps it grouped', () => {
    const pieces = placeShapePieces(shapeChoices('combo', [])[0], { width: 120, height: 80, seam: 3, rotation: 90 }, { x: 200, y: 200 }, 'A', 'B');
    const bounds = pointBounds(pieces.flatMap((p) => p.points));
    expect(bounds.width).toBeCloseTo(80); expect(bounds.height).toBeCloseTo(120);
    expect(bounds.x).toBeCloseTo(160); expect(bounds.y).toBeCloseTo(140);
    expect(pieces).toHaveLength(4);
    expect(new Set(pieces.map((p) => p.groupId)).size).toBe(1);
    expect(pieces.every((p) => Boolean(p.groupId) && p.seamMm === 3)).toBe(true);
    expect(new Set(pieces.map((p) => p.materialId))).toEqual(new Set(['A', 'B']));
  });
  it('rejects empty, negative and non-finite dimensions before canvas changes', () => {
    expect(validShapePlacement({ width: 0, height: 100, seam: 0, rotation: 0 })).toBe(false);
    expect(validShapePlacement({ width: 100, height: 100, seam: NaN, rotation: 0 })).toBe(false);
    expect(() => placeShapePieces(shapeChoices('base', [])[0], { width: -2, height: 100, seam: 0, rotation: 0 }, { x: 0, y: 0 }, 'A')).toThrow();
  });
});
