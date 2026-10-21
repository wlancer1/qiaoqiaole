import { Provider } from 'react-redux';
import { createH5Store } from '../store/store';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppOverlayProvider } from '../app/overlays/AppOverlayContext';
import { PatchworkPage } from './PatchworkPage';

const mountedRenderers: ReactTestRenderer[] = [];

function renderPatchworkPage(props: Parameters<typeof PatchworkPage>[0] = {}) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <Provider store={createH5Store()}><MemoryRouter initialEntries={['/patchwork']}>
        <AppOverlayProvider>
          <PatchworkPage {...props} />
        </AppOverlayProvider>
      </MemoryRouter></Provider>,
      {
        createNodeMock(element) {
          if (element.type === 'canvas') {
            return {
              getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 480 }),
              getContext: () => null,
            };
          }
          return null;
        },
      },
    );
  });
  mountedRenderers.push(renderer);
  return renderer;
}

function findButton(root: ReactTestInstance, label: string) {
  return root.findAllByType('button').find(
    (node) => node.props['aria-label'] === label || node.children.filter((c) => typeof c === 'string').join('') === label,
  )!;
}

afterEach(() => {
  while (mountedRenderers.length > 0) {
    const renderer = mountedRenderers.pop();
    if (renderer) act(() => renderer.unmount());
  }
});

describe('PatchworkPage 底布与项目设置弹窗', () => {
  it('opens, isolates content clicks/touches, supports cancel/backdrop/Escape close, and applies settings on confirm', async () => {
    const listeners = new Map<string, Set<(event: { key?: string; preventDefault: () => void }) => void>>();
    const classList = new Set<string>();
    const prevWindow = globalThis.window;
    const prevDocument = globalThis.document;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        ...prevWindow,
        addEventListener: vi.fn((type: string, fn: (event: { key?: string; preventDefault: () => void }) => void) => {
          const set = listeners.get(type) ?? new Set();
          set.add(fn);
          listeners.set(type, set);
        }),
        removeEventListener: vi.fn((type: string, fn: (event: { key?: string; preventDefault: () => void }) => void) => {
          listeners.get(type)?.delete(fn);
        }),
        dispatchEvent: vi.fn(),
      },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        body: {
          classList: {
            add: (cls: string) => classList.add(cls),
            remove: (cls: string) => classList.delete(cls),
            contains: (cls: string) => classList.has(cls),
          },
        },
      },
    });

    try {
      const renderer = renderPatchworkPage({
        token: 'test-token',
        requestApi: async () => ({ fabrics: [{ id: 'sage-warehouse', name: '鼠尾草绿', color: '#8ea68c', image: null, stockMode: 'own', availableAreaMm2: null, widthMm: null, heightMm: null, quantity: 1, note: null, updatedAt: '' }, { id: 'almond-warehouse', name: '杏仁黄', color: '#d9ad45', image: null, stockMode: 'own', availableAreaMm2: null, widthMm: null, heightMm: null, quantity: 1, note: null, updatedAt: '' }] }) as any,
      });

      // Open via topbar size button
      act(() => {
        findButton(renderer.root, '作品尺寸').props.onClick();
      });

      const dialog = renderer.root.findByProps({ role: 'dialog', 'aria-label': '底布与项目设置' });
      expect(dialog.props['aria-modal']).toBe(true);
      expect(classList.has('h5-modal-open')).toBe(true);

      // Content click & touch do not propagate to backdrop
      const stopClick = vi.fn();
      const stopTouch = vi.fn();
      act(() => {
        dialog.props.onClick({ stopPropagation: stopClick });
        dialog.props.onTouchStart({ stopPropagation: stopTouch });
      });
      expect(stopClick).toHaveBeenCalledTimes(1);
      expect(stopTouch).toHaveBeenCalledTimes(1);
      expect(renderer.root.findAllByProps({ role: 'dialog', 'aria-label': '底布与项目设置' })).toHaveLength(1);

      // Edit width and cancel -> should not apply
      const numberInputs = dialog.findAll((node) => node.type === 'input' && node.props.type === 'number');
      expect(numberInputs).toHaveLength(2);
      act(() => {
        numberInputs[0].props.onChange({ target: { value: '30' } });
      });
      act(() => {
        findButton(dialog, '取消').props.onClick();
      });
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
      expect(classList.has('h5-modal-open')).toBe(false);
      expect(findButton(renderer.root, '作品尺寸').children.join('')).toContain('40 × 40 cm');

      // Reopen and close via Escape
      act(() => {
        findButton(renderer.root, '作品尺寸').props.onClick();
      });
      expect(renderer.root.findAllByProps({ role: 'dialog', 'aria-label': '底布与项目设置' })).toHaveLength(1);
      act(() => {
        const preventDefault = vi.fn();
        listeners.get('keydown')?.forEach((fn) => fn({ key: 'Escape', preventDefault }));
        expect(preventDefault).toHaveBeenCalled();
      });
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);

      // Reopen and close via backdrop click
      act(() => {
        findButton(renderer.root, '作品尺寸').props.onClick();
      });
      const overlay = renderer.root.find((node) => node.type === 'div' && String(node.props.className || '').includes('patchwork-overlay'));
      act(() => {
        overlay.props.onClick();
      });
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);

      // Reopen, edit fields & switches, pick base fabric via swatch tile, and confirm with 应用设置
      act(() => {
        findButton(renderer.root, '作品尺寸').props.onClick();
      });
      const openDialog = renderer.root.findByProps({ role: 'dialog', 'aria-label': '底布与项目设置' });
      const selects = openDialog.findAllByType('select');
      expect(selects).toHaveLength(1);
      const nameInput = openDialog.find((node) => node.type === 'input' && node.props.type === 'text');
      const [widthInput, heightInput] = openDialog.findAll((node) => node.type === 'input' && node.props.type === 'number');
      const switches = openDialog.findAll((node) => node.type === 'input' && node.props.type === 'checkbox');
      expect(switches).toHaveLength(3);
      switches.forEach((sw) => expect(sw.props.className).toContain('patchwork-switch'));

      const fabricTrigger = findButton(openDialog, '选择底布布料');
      expect(fabricTrigger.findByType('small').children.join('')).toContain('亚麻米白');

      await act(async () => {
        nameInput.props.onChange({ target: { value: '春日拼布' } });
        widthInput.props.onChange({ target: { value: '32' } });
        heightInput.props.onChange({ target: { value: '26' } });
        switches[2].props.onChange({ target: { checked: true } });
        fabricTrigger.props.onClick();
      });

      const fabricSheet = renderer.root.findByProps({ role: 'dialog', 'aria-label': '选择布料' });
      await act(async () => {
        await findButton(fabricSheet, '选择布料 鼠尾草绿').props.onClick();
      });

      const returnedDialog = renderer.root.findByProps({ role: 'dialog', 'aria-label': '底布与项目设置' });
      expect(findButton(returnedDialog, '选择底布布料').findByType('small').children.join('')).toContain('鼠尾草绿');

      act(() => {
        findButton(returnedDialog, '应用设置').props.onClick();
      });

      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
      expect(findButton(renderer.root, '作品尺寸').children.join('')).toContain('32 × 26 cm');

      // Verify topbar left/center/right grouping and export/save buttons
      const topbar = renderer.root.find((node) => node.type === 'header' && String(node.props.className || '').includes('patchwork-top'));
      const leftGroup = topbar.find((node) => node.type === 'div' && node.props.className === 'topbar-left');
      const centerGroup = topbar.find((node) => node.type === 'div' && node.props.className === 'topbar-center');
      const rightGroup = topbar.find((node) => node.type === 'div' && node.props.className === 'topbar-right');
      expect(leftGroup.findAllByType('button').map((b) => b.props['aria-label'])).toEqual(['返回', '作品尺寸']);
      expect(centerGroup.findAllByType('button').map((b) => b.props['aria-label'])).toEqual(['撤销', '重做']);
      expect(rightGroup.findAllByType('button').map((b) => b.props['aria-label'])).toEqual(['导出', '保存']);

      // Reopen to verify selected base material persisted
      act(() => {
        findButton(renderer.root, '作品尺寸').props.onClick();
      });
      const verifyDialog = renderer.root.findByProps({ role: 'dialog', 'aria-label': '底布与项目设置' });
      expect(findButton(verifyDialog, '选择底布布料').findByType('small').children.join('')).toContain('鼠尾草绿');
      act(() => {
        findButton(verifyDialog, '取消').props.onClick();
      });

      // Open 图纸导出 modal and verify tab switching between 裁片清单 and 打印预览
      act(() => {
        findButton(renderer.root, '导出').props.onClick();
      });
      const exportDialog = renderer.root.findByProps({ role: 'dialog', 'aria-label': '图纸导出' });
      expect(String(exportDialog.props.className)).toContain('exportsheet');
      const listTab = findButton(exportDialog, '裁片清单');
      const previewTab = findButton(exportDialog, '打印预览');
      expect(listTab.props['aria-selected']).toBe(true);
      expect(previewTab.props['aria-selected']).toBe(false);
      expect(findButton(exportDialog, '预览 PNG')).toBeTruthy();
      expect(findButton(exportDialog, '导出 PDF')).toBeTruthy();

      act(() => {
        previewTab.props.onClick();
      });
      expect(findButton(exportDialog, '裁片清单').props['aria-selected']).toBe(false);
      expect(findButton(exportDialog, '打印预览').props['aria-selected']).toBe(true);
      expect(exportDialog.findAll((node) => node.type === 'div' && String(node.props.className || '').includes('pw-export-preview-stage'))).toHaveLength(1);
      expect(findButton(exportDialog, '下载 PNG')).toBeTruthy();
      expect(findButton(exportDialog, '导出 PDF')).toBeTruthy();

      act(() => {
        findButton(exportDialog, '裁片清单').props.onClick();
      });
      expect(findButton(exportDialog, '裁片清单').props['aria-selected']).toBe(true);
      expect(exportDialog.findAll((node) => node.type === 'div' && String(node.props.className || '').includes('pw-cutlist'))).toHaveLength(1);
      act(() => {
        findButton(exportDialog, '关闭面板').props.onClick();
      });

      // Place a shape on canvas, open 布片属性, and pick piece fabric via shared FabricPicker
      act(() => {
        findButton(renderer.root, '添加').props.onClick();
      });
      const addDialog = renderer.root.findByProps({ role: 'dialog', 'aria-label': '添加形状' });
      act(() => {
        findButton(addDialog, '基础形状').props.onClick();
      });
      // 直接点形状卡片便落到画布，不再有“下一步/放置到画布”。
      expect(addDialog.findAllByType('button').some((button) => button.children.includes('下一步'))).toBe(false);
      await act(async () => {
        await findButton(addDialog, '添加形状 正方形').props.onClick();
      });

      act(() => {
        findButton(renderer.root, '属性').props.onClick();
      });
      const propsDialog = renderer.root.findByProps({ role: 'dialog', 'aria-label': '布片属性' });
      expect(propsDialog.props['aria-modal']).toBe(true);
      expect(String(propsDialog.props.className)).toContain('propssheet');
      expect(propsDialog.findAllByType('select')).toHaveLength(0);

      const pieceFabricTrigger = findButton(propsDialog, '选择布片布料');
      expect(pieceFabricTrigger.findByType('small').children.join('')).toContain('樱花粉');

      act(() => {
        pieceFabricTrigger.props.onClick();
      });
      const pieceFabricSheet = renderer.root.findByProps({ role: 'dialog', 'aria-label': '选择布料' });
      act(() => {
        findButton(pieceFabricSheet, '选择布料 杏仁黄').props.onClick();
      });

      const returnedPropsDialog = renderer.root.findByProps({ role: 'dialog', 'aria-label': '布片属性' });
      expect(findButton(returnedPropsDialog, '选择布片布料').findByType('small').children.join('')).toContain('杏仁黄');

      const pieceNameInput = returnedPropsDialog.find((node) => node.type === 'input' && node.props.type === 'text');
      act(() => {
        pieceNameInput.props.onFocus();
        pieceNameInput.props.onChange({ target: { value: '中心方块' } });
      });
      act(() => {
        findButton(returnedPropsDialog, '完成').props.onClick();
      });
      expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
    } finally {
      while (mountedRenderers.length > 0) {
        const renderer = mountedRenderers.pop();
        if (renderer) act(() => renderer.unmount());
      }
      Object.defineProperty(globalThis, 'window', { configurable: true, value: prevWindow });
      Object.defineProperty(globalThis, 'document', { configurable: true, value: prevDocument });
    }
  });

  it('supports 用料与配布 tab, smart warehouse fabric replacement for unlinked fabrics, and cutting stock deduction', async () => {
    const prevWindow = globalThis.window;
    const prevDocument = globalThis.document;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        ...prevWindow,
        devicePixelRatio: 1,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        body: {
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
            contains: () => false,
          },
        },
      },
    });
    const mockFabrics = [
      {
        id: 'wh-rose',
        name: '仓库玫瑰粉棉布',
        color: '#ef9db4',
        category: '棉布',
        stockMode: 'size',
        image: null,
        widthMm: 500,
        heightMm: 400,
        quantity: 1,
        availableAreaMm2: 200_000,
        note: null,
        updatedAt: '2026-10-19T12:00:00.000Z',
      },
    ];
    const requestApi = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/fabrics' && (!init?.method || init.method === 'GET')) {
        return { fabrics: mockFabrics };
      }
      if (url === '/fabrics/consume' && init?.method === 'POST') {
        return {
          fabrics: [{ ...mockFabrics[0], availableAreaMm2: 185_000 }],
          applied: [{ fabricId: 'wh-rose', actualAreaMm2: 15_000 }],
        };
      }
      return {};
    });

    try {
      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(
          <Provider store={createH5Store()}>
            <MemoryRouter initialEntries={['/patchwork']}>
              <AppOverlayProvider>
                <PatchworkPage
                  token="tok-1"
                  requireLogin={async (next) => { next('tok-1'); return true; }}
                  requestApi={requestApi as any}
                />
              </AppOverlayProvider>
            </MemoryRouter>
          </Provider>,
          {
            createNodeMock(element) {
              if (element.type === 'canvas') {
                return {
                  getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 480 }),
                  getContext: () => null,
                };
              }
              return null;
            },
          },
        );
      });
      mountedRenderers.push(renderer);

      // Add a square piece on canvas (uses default active material M1 樱花粉)
      act(() => {
        findButton(renderer.root, '添加').props.onClick();
      });
      const addDialog = renderer.root.findByProps({ role: 'dialog', 'aria-label': '添加形状' });
      act(() => {
        findButton(addDialog, '基础形状').props.onClick();
      });
      await act(async () => {
        await findButton(addDialog, '添加形状 正方形').props.onClick();
      });

      // Open 图纸导出 -> switch to 用料与配布
      await act(async () => {
        findButton(renderer.root, '导出').props.onClick();
      });
      const exportDialog = renderer.root.findByProps({ role: 'dialog', 'aria-label': '图纸导出' });
      await act(async () => {
        findButton(exportDialog, '用料与配布').props.onClick();
      });

      expect(exportDialog.findByProps({ 'aria-label': '用料核算与智能配布' })).toBeTruthy();

      // Click 换成我的布 on 樱花粉
      await act(async () => {
        findButton(exportDialog, '换成我的布 樱花粉').props.onClick();
      });

      // Pick recommended warehouse fabric 仓库玫瑰粉棉布
      await act(async () => {
        findButton(exportDialog, '选用 仓库玫瑰粉棉布 替换').props.onClick();
      });

      // Now the material is replaced with 仓库玫瑰粉棉布 and linked to inventory, so 已裁剪，扣减仓库库存 appears
      const consumeTrigger = findButton(exportDialog, '已裁剪，扣减仓库库存');
      expect(consumeTrigger).toBeTruthy();

      await act(async () => {
        consumeTrigger.props.onClick();
      });
      const confirmRegion = exportDialog.findByProps({ 'aria-label': '确认裁片扣减库存' });
      expect(confirmRegion).toBeTruthy();

      await act(async () => {
        findButton(confirmRegion, '确认已裁剪并扣减库存').props.onClick();
      });

      const consumeCall = requestApi.mock.calls.find(call => call[0] === '/fabrics/consume')!;
      expect(JSON.parse(consumeCall[1]!.body as string).items[0]).toHaveProperty('actualAreaMm2');
      expect(requestApi).toHaveBeenCalledWith(
        '/fabrics/consume',
        expect.objectContaining({ method: 'POST' }),
        'tok-1',
      );
    } finally {
      while (mountedRenderers.length > 0) {
        const renderer = mountedRenderers.pop();
        if (renderer) act(() => renderer.unmount());
      }
      Object.defineProperty(globalThis, 'window', { configurable: true, value: prevWindow });
      Object.defineProperty(globalThis, 'document', { configurable: true, value: prevDocument });
    }
  });

  it('uses unified bottom-sheet tokens, 2-column form grid, fabric trigger, aligned topbar controls, and stable export sheet in CSS', () => {
    const css = fs.readFileSync(path.resolve(__dirname, 'patchwork.css'), 'utf8');
    expect(css).toContain('var(--sheet-width,12.127rem)');
    expect(css).toContain('var(--sheet-radius,.6984rem)');
    expect(css).toContain('.patchwork-form input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color])');
    expect(css).toContain('.pw-base-fabric-trigger');
    expect(css).toContain('.pw-settings-card');
    expect(css).toContain('.pw-base-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(css).toContain('.patchwork-topbtn,.patchwork-savebtn{box-sizing:border-box;display:inline-flex;flex-direction:row;align-items:center;justify-content:center;gap:.127rem;height:1.0159rem;border-radius:999px');
    expect(css).toContain('.patchwork-topbtn svg,.patchwork-savebtn svg{width:.4444rem;height:.4444rem;flex-shrink:0;stroke-width:2.2}');
    expect(css).toContain('.patchwork-overlay .patchwork-panel.exportsheet{height:min(78dvh,19.5rem)');
    expect(css).toContain('.pw-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(css).toContain('.pw-export-preview-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center');
    expect(css).toContain('.patchwork-import .pw-preview');
    expect(css).toContain('.pw-props-actions .pw-widebtn');
  });
});
