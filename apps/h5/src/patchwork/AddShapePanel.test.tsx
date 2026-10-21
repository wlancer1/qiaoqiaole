import type { ComponentProps } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddShapePanel } from './AddShapePanel';

const mounted: ReactTestRenderer[] = [];
afterEach(() => { mounted.splice(0).forEach((r) => act(() => r.unmount())); });

const template = { id: 'leaf', name: '测试叶片', points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 120 }] };
function render(templates = [template], library?: ComponentProps<typeof AddShapePanel>['library']) {
  const onPlace = vi.fn(), onImport = vi.fn(), onCancel = vi.fn(), onTemplatesChange = vi.fn(() => true);
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<AddShapePanel templates={templates} library={library} onTemplatesChange={onTemplatesChange}
      onPlace={onPlace} onImport={onImport} onCancel={onCancel} defaultSeam={5} />);
  });
  mounted.push(renderer);
  return { root: renderer.root, onPlace, onImport, onCancel, onTemplatesChange };
}
function clickText(root: ReactTestRenderer['root'], text: string) {
  return act(() => root.findAllByType('button').find((b) => b.children.includes(text))!.props.onClick());
}

function scroll(root: ReactTestRenderer['root'], atBottom = true) {
  act(() => root.findByProps({ className: 'pw-add-body' }).props.onScroll({
    currentTarget: { scrollTop: atBottom ? 600 : 100, scrollHeight: 1000, clientHeight: 400 },
  }));
}

describe('AddShapePanel：点击形状立即放到画布', () => {
  it('默认我的形状，点击前不添加且关闭由外层面板负责', () => {
    const h = render();
    expect(h.root.findAllByProps({ role: 'tab' }).map((tab) => tab.children.join(''))).toEqual(['我的形状', '基础形状']);
    expect(h.root.findAllByProps({ role: 'tab' })[0].props['aria-selected']).toBe(true);
    expect(h.root.findAllByType('button').some((b) => b.children.includes('下一步') || b.children.includes('放置到画布'))).toBe(false);
    expect(h.root.findAllByType('button').some((b) => b.children.includes('取消'))).toBe(false);
    expect(h.onPlace).not.toHaveBeenCalled();
  });

  it('点我的形状立即放置，保留原始宽高与默认缝份', async () => {
    const h = render();
    await act(async () => { h.root.findByProps({ 'aria-label': '添加形状 测试叶片' }).props.onClick(); });
    expect(h.onPlace).toHaveBeenCalledOnce();
    expect(h.onPlace).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'leaf' }),
      { width: 80, height: 120, seam: 5, rotation: 0 });
  });

  it('基础形状也一键放置，不需要下一步或输入尺寸', async () => {
    const h = render();
    clickText(h.root, '基础形状');
    await act(async () => { h.root.findByProps({ 'aria-label': '添加形状 正方形' }).props.onClick(); });
    expect(h.onPlace).toHaveBeenCalledOnce();
    expect(h.onPlace).toHaveBeenCalledWith(expect.objectContaining({ id: 'rect' }),
      { width: 100, height: 100, seam: 5, rotation: 0 });
    expect(h.root.findAllByProps({ 'aria-label': '形状宽度' })).toHaveLength(0);
  });

  it('53 个基础裁片可按几何、曲线、花叶、装饰筛选；搜索不会被分组隐藏', async () => {
    const h = render();
    clickText(h.root, '基础形状');
    expect(h.root.findAllByProps({ className: 'pw-add-choice' })).toHaveLength(16);
    clickText(h.root, '花叶植物');
    expect(h.root.findAllByProps({ className: 'pw-add-choice' })).toHaveLength(7);
    expect(h.root.findAllByProps({ 'aria-label': '添加形状 六瓣花' })).toHaveLength(1);
    act(() => h.root.findByProps({ 'aria-label': '搜索形状' }).props.onChange({ target: { value: '蝴蝶' } }));
    expect(h.root.findAllByProps({ 'aria-label': '添加形状 蝴蝶' })).toHaveLength(1);
    expect(h.root.findAllByProps({ 'aria-label': '添加形状 蝴蝶结' })).toHaveLength(1);
    await act(async () => { h.root.findByProps({ 'aria-label': '添加形状 蝴蝶' }).props.onClick(); });
    expect(h.onPlace).toHaveBeenCalledOnce();
    expect(h.onPlace.mock.calls[0][0].id).toBe('butterfly');
    clickText(h.root, '几何裁片');
    // 有搜索词时仍在全部基础形状中搜索；清空搜索后恢复几何分组。
    expect(h.root.findAllByProps({ 'aria-label': '添加形状 蝴蝶' })).toHaveLength(1);
    act(() => h.root.findByProps({ 'aria-label': '搜索形状' }).props.onChange({ target: { value: '' } }));
    expect(h.root.findAllByProps({ 'aria-label': '添加形状 蝴蝶' })).toHaveLength(0);
    expect(h.root.findAllByProps({ 'aria-label': '添加形状 长方形' })).toHaveLength(1);
  });
  it('选择形状卡片只展示图形和名称，不展示默认尺寸', () => {
    const h = render();
    expect(h.root.findAllByType('small')).toHaveLength(0);
    clickText(h.root, '基础形状');
    expect(h.root.findAllByType('small')).toHaveLength(0);
    clickText(h.root, '圆弧曲线');
    expect(h.root.findAllByProps({ 'aria-label': '添加形状 半圆环' })).toHaveLength(1);
  });

  it('上拉每次追加16个基础形状，保留前面的卡片并在末尾停止', () => {
    const h = render();
    clickText(h.root, '基础形状');
    expect(h.root.findAllByProps({ 'aria-label': '形状分页' })).toHaveLength(0);
    const initial = h.root.findAllByProps({ className: 'pw-add-choice' }).map((c) => c.props['aria-label']);
    scroll(h.root, false);
    expect(h.root.findAllByProps({ className: 'pw-add-choice' })).toHaveLength(16);
    for (const count of [32, 48, 53, 53]) {
      scroll(h.root);
      const cards = h.root.findAllByProps({ className: 'pw-add-choice' });
      expect(cards).toHaveLength(count);
      expect(cards.slice(0, 16).map((c) => c.props['aria-label'])).toEqual(initial);
      expect(new Set(cards.map((c) => c.props['aria-label'])).size).toBe(count);
    }
    expect(h.onPlace).not.toHaveBeenCalled();
  });

  it('上拉后搜索、分组、分类和我的形状筛选都恢复首批', () => {
    const h = render(Array.from({ length: 20 }, (_, i) => ({ ...template, id: `shape-${i}`, name: `形状${i}` })));
    scroll(h.root);
    expect(h.root.findAllByProps({ className: 'pw-add-choice' })).toHaveLength(20);
    clickText(h.root, '全部');
    expect(h.root.findAllByProps({ className: 'pw-add-choice' })).toHaveLength(16);
    clickText(h.root, '基础形状');
    scroll(h.root);
    act(() => h.root.findByProps({ 'aria-label': '搜索形状' }).props.onChange({ target: { value: '三角形' } }));
    expect(h.root.findByProps({ 'aria-label': '添加形状 等边三角形' })).toBeTruthy();
    act(() => h.root.findByProps({ 'aria-label': '搜索形状' }).props.onChange({ target: { value: '' } }));
    expect(h.root.findAllByProps({ className: 'pw-add-choice' })).toHaveLength(16);
    scroll(h.root);
    clickText(h.root, '几何裁片');
    expect(h.root.findAllByProps({ className: 'pw-add-choice' })).toHaveLength(16);
    scroll(h.root);
    clickText(h.root, '我的形状');
    expect(h.root.findAllByProps({ className: 'pw-add-choice' })).toHaveLength(16);
  });

  it('云端形状先展示已有数据，触底才请求下一批并拦截重复请求', () => {
    const loadMore = vi.fn();
    const h = render(Array.from({ length: 30 }, (_, i) => ({ ...template, id: `shape-${i}` })), {
      setBrowse: vi.fn(), loading: false, saving: false, hasMore: true, loadMore,
      error: '', retry: vi.fn(), accountId: 'test',
    });
    expect(loadMore).not.toHaveBeenCalled();
    expect(h.root.findAllByProps({ className: 'pw-add-more' })).toHaveLength(0);
    scroll(h.root);
    expect(h.root.findAllByProps({ className: 'pw-add-choice' })).toHaveLength(30);
    expect(loadMore).not.toHaveBeenCalled();
    scroll(h.root);
    scroll(h.root);
    expect(loadMore).toHaveBeenCalledOnce();
  });

  it('云端加载中、失败或没有更多数据时触底不会重复请求', () => {
    for (const state of [{ loading: true, error: '', hasMore: true }, { loading: false, error: '加载失败', hasMore: true }, { loading: false, error: '', hasMore: false }]) {
      const loadMore = vi.fn();
      const h = render([template], { ...state, setBrowse: vi.fn(), saving: false, loadMore, retry: vi.fn(), accountId: 'test' });
      scroll(h.root);
      expect(loadMore).not.toHaveBeenCalled();
    }
  });

  it('导入、搜索和收藏不会错误触发添加', () => {
    const h = render();
    act(() => h.root.findByProps({ className: 'pw-add-import' }).props.onClick());
    expect(h.onImport).toHaveBeenCalledOnce();
    act(() => h.root.findByProps({ 'aria-label': '收藏 测试叶片' }).props.onClick());
    expect(h.onTemplatesChange).toHaveBeenCalledWith([expect.objectContaining({ favorite: true })]);
    act(() => h.root.findByProps({ 'aria-label': '搜索形状' }).props.onChange({ target: { value: '不存在' } }));
    expect(h.root.findAllByProps({ 'aria-label': '添加形状 测试叶片' })).toHaveLength(0);
    expect(h.onPlace).not.toHaveBeenCalled();
  });

  it('异步放置未完成时拦截重复点击', async () => {
    const h = render();
    let resolve!: () => void;
    h.onPlace.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    act(() => h.root.findByProps({ 'aria-label': '添加形状 测试叶片' }).props.onClick());
    expect(h.root.findByProps({ 'aria-label': '添加形状 测试叶片' }).props.disabled).toBe(true);
    expect(h.onPlace).toHaveBeenCalledOnce();
    await act(async () => resolve());
  });
});
