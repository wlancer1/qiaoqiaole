import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddShapePanel } from './AddShapePanel';
const mounted: ReactTestRenderer[] = [];
afterEach(() => { mounted.splice(0).forEach((r) => act(() => r.unmount())); });
const template = { id: 'leaf', name: '测试叶片', points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 120 }] };
function render() {
  const onPlace = vi.fn(), onImport = vi.fn(), onCancel = vi.fn(), onTemplatesChange = vi.fn(() => true);
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<AddShapePanel templates={[template]} onTemplatesChange={onTemplatesChange} onPlace={onPlace} onImport={onImport} onCancel={onCancel} />); });
  mounted.push(renderer);
  return { root: renderer.root, onPlace, onImport, onCancel, onTemplatesChange };
}
const clickText = (root: ReactTestRenderer['root'], text: string) => act(() => root.findAllByType('button').find((b) => b.children.includes(text))!.props.onClick());
describe('AddShapePanel', () => {
  it('defaults to My Shapes and does not place anything when choosing or cancelling', () => {
    const h = render();
    expect(h.root.findAllByProps({ role: 'tab' }).map((tab) => tab.children.join(''))).toEqual(['我的形状', '基础形状']);
    expect(h.root.findAllByProps({ role: 'tab' })[0].props['aria-selected']).toBe(true);
    act(() => h.root.findByProps({ 'aria-label': '选择形状 测试叶片' }).props.onClick());
    expect(h.onPlace).not.toHaveBeenCalled();
    clickText(h.root, '取消'); expect(h.onCancel).toHaveBeenCalledOnce();
  });
  it('edits dimensions with aspect locking and applies seam and rotation only on placement', () => {
    const h = render();
    act(() => h.root.findByProps({ 'aria-label': '选择形状 测试叶片' }).props.onClick());
    clickText(h.root, '下一步');
    act(() => h.root.findByProps({ 'aria-label': '形状宽度' }).props.onChange({ target: { value: '100' } }));
    expect(h.root.findByProps({ 'aria-label': '形状高度' }).props.value).toBe('150');
    act(() => h.root.findByProps({ 'aria-label': '形状缝份' }).props.onChange({ target: { value: '5' } }));
    clickText(h.root, '旋转 90°'); clickText(h.root, '放置到画布');
    expect(h.onPlace).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'leaf' }), { width: 100, height: 150, seam: 5, rotation: 90 });
  });
  it('keeps invalid inputs out of the canvas and enables independent sizing when unlocked', () => {
    const h = render();
    act(() => h.root.findByProps({ 'aria-label': '选择形状 测试叶片' }).props.onClick()); clickText(h.root, '下一步');
    act(() => h.root.findByProps({ 'aria-label': '锁定宽高比例' }).props.onClick());
    act(() => h.root.findByProps({ 'aria-label': '形状宽度' }).props.onChange({ target: { value: '' } }));
    expect(h.root.findAllByType('button').find((b) => b.children.includes('放置到画布'))!.props.disabled).toBe(true);
    clickText(h.root, '放置到画布'); expect(h.onPlace).not.toHaveBeenCalled();
    expect(h.root.findByProps({ 'aria-label': '形状高度' }).props.value).toBe('120');
  });
  it('supports import, search and favoriting without placing shapes', () => {
    const h = render();
    act(() => h.root.findByProps({ className: 'pw-add-import' }).props.onClick()); expect(h.onImport).toHaveBeenCalledOnce();
    act(() => h.root.findByProps({ 'aria-label': '收藏 测试叶片' }).props.onClick());
    expect(h.onTemplatesChange).toHaveBeenCalledWith([expect.objectContaining({ favorite: true })]);
    act(() => h.root.findByProps({ 'aria-label': '搜索形状' }).props.onChange({ target: { value: '不存在' } }));
    expect(h.root.findAllByProps({ 'aria-label': '选择形状 测试叶片' })).toHaveLength(0);
    expect(h.onPlace).not.toHaveBeenCalled();
  });
});
