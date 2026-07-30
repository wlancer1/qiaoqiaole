import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { Children, createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  FlowTopbar,
  HomeUploadHero,
  SegmentedControl,
  SplitBeadList,
  ThresholdControl,
  getImportAction,
} from './H5FlowComponents';

describe('H5 flow presentation components', () => {
  it('defers expensive split merge recomputation away from slider input updates', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');
    const sourceFile = ts.createSourceFile('H5App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let usesDeferredHook = false;
    let mergeUsesDeferredThreshold = false;

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'useDeferredValue'
        && node.arguments[0]?.getText(sourceFile) === 'splitMergeThreshold'
      ) {
        usesDeferredHook = true;
      }

      if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'mergeSimilarCells'
        && node.arguments[1]?.getText(sourceFile) === 'deferredSplitMergeThreshold'
      ) {
        mergeUsesDeferredThreshold = true;
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    expect(usesDeferredHook).toBe(true);
    expect(mergeUsesDeferredThreshold).toBe(true);
  });

  it('builds a disabled primary import action for an empty canvas', () => {
    const onClick = vi.fn();

    expect(getImportAction(0, onClick)).toEqual({
      label: '导入画布',
      onClick,
      disabled: true,
      primary: true,
    });
  });

  it('removes the click handler from a disabled topbar action', () => {
    const onClick = vi.fn();
    const tree = FlowTopbar({
      title: '分割设置',
      backLabel: '返回首页',
      onBack: vi.fn(),
      action: { label: '导入画布', onClick, disabled: true, primary: true },
    });
    const action = Children.toArray(tree.props.children)[2] as ReactElement<{
      disabled?: boolean;
      onClick?: () => void;
    }>;

    expect(action.props.disabled).toBe(true);
    expect(action.props.onClick).toBeUndefined();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks only the selected segment as selected and keyboard reachable', () => {
    const markup = renderToStaticMarkup(createElement(SegmentedControl, {
      ariaLabel: '分割方式',
      value: 'quick',
      onChange: vi.fn(),
      options: [
        { value: 'quick', label: '快速分割' },
        { value: 'align', label: '对格子' },
      ],
    }));

    expect(markup).toContain('aria-selected="true"');
    expect(markup).toMatch(/class="is-active"[^>]*role="tab"[^>]*aria-selected="true"/);
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-selected="false"');
    expect(markup).toContain('tabindex="-1"');
  });

  it('links split-mode tabs to their matching controlled panels', () => {
    const markup = renderToStaticMarkup(createElement(SegmentedControl, {
      ariaLabel: '分割模式',
      idPrefix: 'split-mode',
      value: 'quick',
      onChange: vi.fn(),
      options: [
        { value: 'quick', label: '快速分割' },
        { value: 'align', label: '对格子' },
      ],
    }));

    expect(markup).toMatch(/id="split-mode-quick-tab"[^>]*aria-controls="split-mode-quick-panel"/);
    expect(markup).toMatch(/id="split-mode-align-tab"[^>]*aria-controls="split-mode-align-panel"/);
  });

  it('loops segmented-control focus and selection with arrow keys', () => {
    const onChange = vi.fn();
    const tree = SegmentedControl<'quick' | 'align'>({
      ariaLabel: '分割方式',
      value: 'quick',
      onChange,
      options: [
        { value: 'quick', label: '快速分割' },
        { value: 'align', label: '对格子' },
      ],
    });
    const focusTargets = [{ focus: vi.fn() }, { focus: vi.fn() }];
    type FakeKeyEvent = {
      key: string;
      preventDefault: ReturnType<typeof vi.fn>;
      currentTarget: { parentElement: { querySelectorAll: () => typeof focusTargets } };
    };
    const tabs = Children.toArray(tree.props.children) as ReactElement<{
      onKeyDown: (event: FakeKeyEvent) => void;
    }>[];
    const keyEvent = (key: string): FakeKeyEvent => ({
      key,
      preventDefault: vi.fn(),
      currentTarget: { parentElement: { querySelectorAll: () => focusTargets } },
    });

    const leftEvent = keyEvent('ArrowLeft');
    tabs[0].props.onKeyDown(leftEvent);
    expect(leftEvent.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenNthCalledWith(1, 'align');
    expect(focusTargets[1].focus).toHaveBeenCalledOnce();

    const rightEvent = keyEvent('ArrowRight');
    tabs[1].props.onKeyDown(rightEvent);
    expect(rightEvent.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenNthCalledWith(2, 'quick');
    expect(focusTargets[0].focus).toHaveBeenCalledOnce();
  });

  it('renders the compact Figma threshold slider controls', () => {
    const markup = renderToStaticMarkup(createElement(ThresholdControl, {
      value: 0,
      min: 0,
      max: 20,
      onChange: vi.fn(),
    }));

    expect(markup).toContain('class="split-threshold-head"');
    expect(markup).toContain('class="split-threshold-row"');
    expect(markup).toContain('class="split-threshold-help"');
    expect(markup).toContain('减少');
    expect(markup).toContain('增加');
    expect(markup).toContain('≤ 0');
  });

  it('associates each threshold output with a unique range input', () => {
    const markup = renderToStaticMarkup(createElement('div', null,
      createElement(ThresholdControl, { value: 0, min: 0, max: 20, onChange: vi.fn() }),
      createElement(ThresholdControl, { value: 5, min: 0, max: 20, onChange: vi.fn() }),
    ));
    const rangeTags = markup.match(/<input\b[^>]*type="range"[^>]*>/g) ?? [];
    const rangeIds = rangeTags.map((tag) => tag.match(/\sid="([^"]+)"/)?.[1] ?? '');
    const outputFors = [...markup.matchAll(/<output\b[^>]*for="([^"]+)"/g)].map((match) => match[1]);

    expect(rangeIds).toHaveLength(2);
    expect(rangeIds.every(Boolean)).toBe(true);
    expect(rangeIds[0]).not.toBe(rangeIds[1]);
    expect(outputFors).toEqual(rangeIds);
  });

  it('renders both empty bead-list totals', () => {
    const markup = renderToStaticMarkup(createElement(SplitBeadList, {
      colors: [],
      totalBeads: 0,
    }));

    expect(markup).toContain('颜色种类');
    expect(markup).toContain('总豆子数');
    expect(markup).toContain('class="split-bead-list-summary"');
    expect(markup).toContain('class="split-bead-list"');
  });

  it('renders complete stroke attributes for the upload and back icons', () => {
    const uploadMarkup = renderToStaticMarkup(createElement(HomeUploadHero, { onUpload: vi.fn() }));
    const topbarMarkup = renderToStaticMarkup(createElement(FlowTopbar, {
      title: '分割设置',
      backLabel: '返回首页',
      onBack: vi.fn(),
    }));

    const uploadSvgs = uploadMarkup.match(/<svg\b[^>]*>/g) ?? [];
    const watermarkSvg = uploadSvgs.find((tag) => tag.includes('viewBox="0 0 48 48"')) ?? '';
    const uploadSvg = uploadSvgs.find((tag) => tag.includes('viewBox="0 0 24 24"')) ?? '';
    const topbarSvg = topbarMarkup.match(/<svg\b[^>]*>/)?.[0] ?? '';

    expect(watermarkSvg).toContain('fill="none"');
    expect(watermarkSvg).toContain('stroke="currentColor"');
    expect(watermarkSvg).toContain('stroke-width="4"');
    expect(watermarkSvg).toContain('stroke-linecap="round"');
    expect(watermarkSvg).toContain('stroke-linejoin="round"');
    expect(uploadSvg).toContain('fill="none"');
    expect(uploadSvg).toContain('stroke="currentColor"');
    expect(uploadSvg).toContain('stroke-width="2.4"');
    expect(uploadSvg).toContain('stroke-linecap="round"');
    expect(uploadSvg).toContain('stroke-linejoin="round"');
    expect(topbarSvg).toContain('fill="none"');
    expect(topbarSvg).toContain('stroke="currentColor"');
    expect(topbarSvg).toContain('stroke-width="2.5"');
    expect(topbarSvg).toContain('stroke-linecap="round"');
    expect(topbarSvg).toContain('stroke-linejoin="round"');
  });
});
