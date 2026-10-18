import { describe, expect, it } from 'vitest';
import { makePiece, makeProject, makeShape, transformPoints, validatePiece } from './model';
import { buildPatternPdf, cutList, planIssues } from './export';

describe('patchwork model（需求验收）', () => {
  it('AC01：开放曲线与自交轮廓被阻止并给出原因', () => {
    expect(validatePiece([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toMatch(/未闭合/);
    expect(validatePiece([{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 6, y: 6 }, { x: 2, y: -3 }])).toMatch(/自交/);
    expect(validatePiece(makeShape('rect', 100, 80, 50, 40))).toBe('');
  });

  it('AC04：镜像两次恢复原几何', () => {
    const pts = makeShape('triangle', 60, 40, 100, 100);
    const twice = transformPoints(transformPoints(pts, 'mirrorX'), 'mirrorX');
    pts.forEach((p, i) => {
      expect(twice[i].x).toBeCloseTo(p.x, 6);
      expect(twice[i].y).toBeCloseTo(p.y, 6);
    });
  });

  it('AC12：隐藏布片只由明确选项控制是否进清单', () => {
    const project = makeProject();
    const piece = makePiece(makeShape('rect', 50, 50, 100, 100), 'B', '隐藏片');
    piece.visible = false;
    project.pieces.push(piece);
    expect(cutList(project, true)).toHaveLength(1);
    expect(cutList(project, false)).toHaveLength(0);
  });

  it('AC14：PDF 为矢量输出且 A4 毫米换算稳定', async () => {
    const project = makeProject();
    project.pieces.push(makePiece(makeShape('rect', 100, 100, 200, 200), 'B', '测试片'));
    expect(planIssues(project)).toEqual([]);
    const blob = buildPatternPdf(project, 'A4', true);
    const text = await blob.text();
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('595.2756');
  });

  it('AC11：贴布缝·折边的复杂凹角阻止原尺寸导出', () => {
    const project = makeProject();
    project.technique = 'turned';
    const piece = makePiece([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 50, y: 50 }, { x: 0, y: 100 }], 'B', '凹角片');
    piece.seamMm = 5;
    project.pieces.push(piece);
    expect(planIssues(project).length).toBeGreaterThan(0);
    expect(() => buildPatternPdf(project, 'A4', true)).toThrow();
  });
});
