import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createH5Store } from '../../store/store';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppOverlayProvider } from '../../app/overlays/AppOverlayContext';
import { AppOverlayHost } from '../../app/overlays/AppOverlayHost';
import { FabricWarehousePage, type FabricItem } from './FabricWarehousePage';

const mountedRenderers: ReactTestRenderer[] = [];

afterEach(() => {
  while (mountedRenderers.length > 0) {
    const r = mountedRenderers.pop();
    if (r) act(() => r.unmount());
  }
});

function findButton(root: ReactTestInstance, label: string) {
  return root.findAllByType('button').find(
    (node) => node.props['aria-label'] === label || node.children.filter((c) => typeof c === 'string').join('').trim() === label,
  )!;
}

describe('FabricWarehousePage (独立布料仓库)', () => {
  it('renders standalone fabric warehouse without bead warehouse switch, filters by stock status, and creates/edits fabrics', async () => {
    const initialFabrics: FabricItem[] = [
      {
        id: 'fab-1',
        name: '复古红碎花棉布',
        color: '#d94f3d',
        category: '棉布',
        stockMode: 'size',
        image: null,
        widthMm: 500,
        heightMm: 400,
        quantity: 1,
        availableAreaMm2: 110_000,
        note: '做抱枕剩的',
        updatedAt: '2026-10-19T10:00:00.000Z',
      },
      {
        id: 'fab-2',
        name: '亚麻米白小布头',
        color: '#f2e6d2',
        category: '亚麻',
        stockMode: 'area',
        image: null,
        widthMm: null,
        heightMm: null,
        quantity: 0,
        availableAreaMm2: 0,
        note: null,
        updatedAt: '2026-10-19T09:00:00.000Z',
      },
    ];

    const request = vi.fn(async (path: string, init: RequestInit) => {
      if (path === '/fabrics' && (!init.method || init.method === 'GET')) {
        return { fabrics: initialFabrics };
      }
      if ((path === '/fabrics' && init.method === 'POST') || init.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        return {
          fabric: {
            id: init.method === 'PATCH' ? 'fab-1' : 'fab-new',
            ...body,
            updatedAt: '2026-10-19T11:00:00.000Z',
          },
        };
      }
      return {};
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <Provider store={createH5Store()}><MemoryRouter><AppOverlayProvider>
          <AppOverlayHost />
          <FabricWarehousePage
            token="token-1"
            onBack={vi.fn()}
            request={request as any}
            withLogin={(work) => work('token-1')}
          />
        </AppOverlayProvider></MemoryRouter></Provider>,
      );
    });
    mountedRenderers.push(renderer);

    // Must not mix 拼豆仓库 tab inside 布料仓库
    expect(renderer.root.findAllByProps({ 'aria-label': '仓库类型' })).toHaveLength(0);
    expect(renderer.root.findByProps({ 'aria-label': '布料库存概览' })).toBeTruthy();

    // Both fabrics visible under 全部
    expect(renderer.root.findAll((n) => n.type === 'article' && String(n.props.className).includes('fabric-card'))).toHaveLength(2);

    // Filter by 已用完 -> only fab-2
    await act(async () => {
      findButton(renderer.root, '已用完').props.onClick();
    });
    const depletedCards = renderer.root.findAll((n) => n.type === 'article' && String(n.props.className).includes('fabric-card'));
    expect(depletedCards).toHaveLength(1);
    expect(depletedCards[0].findByType('strong').children.join('')).toContain('亚麻米白小布头');

    // Metadata edits must not refill already consumed size-based stock.
    await act(async () => { findButton(renderer.root, '全部').props.onClick(); });
    await act(async () => { findButton(renderer.root, '编辑 复古红碎花棉布').props.onClick(); });
    const editDialog = renderer.root.findByProps({role:'dialog','aria-label':'编辑布料'});
    await act(async () => { findButton(editDialog, '保存布料').props.onClick(); });
    const patch = request.mock.calls.find(call => call[1]?.method === 'PATCH');
    expect(patch).toBeTruthy();
    expect(JSON.parse(String(patch![1].body)).availableAreaMm2).toBe(110_000);

    // Switch back to 全部 and add a new fabric by size (cm)
    await act(async () => {
      findButton(renderer.root, '全部').props.onClick();
      findButton(renderer.root, '新增布料').props.onClick();
    });

    // 背景点击关闭，内容区点击不穿透
    const stop = vi.fn();
    act(() => { renderer.root.findByProps({ role: 'dialog', 'aria-label': '新增布料' }).props.onClick({ stopPropagation: stop }); });
    expect(stop).toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ role: 'dialog', 'aria-label': '新增布料' })).toHaveLength(1);
    act(() => { renderer.root.find((n) => n.type === 'div' && String(n.props.className).includes('fabric-modal') && n.props.role === 'presentation').props.onClick(); });
    expect(renderer.root.findAllByProps({ role: 'dialog', 'aria-label': '新增布料' })).toHaveLength(0);
    await act(async () => { findButton(renderer.root, '新增布料').props.onClick(); });
    const form = renderer.root.findByProps({ role: 'dialog', 'aria-label': '新增布料' });
    expect(String(form.props['aria-modal'])).toBe('true');
    const nameInput = form.find((n) => n.type === 'input' && n.props.placeholder === '如：复古红碎花棉布');
    // 统一表单：按实际尺寸入库，单位 cm：宽 40 × 高 30
    const widthInput = form.find((n) => n.type === 'input' && n.props.placeholder === '50');
    const heightInput = form.find((n) => n.type === 'input' && n.props.placeholder === '35');
    await act(async () => {
      nameInput.props.onChange({ target: { value: '雾霾蓝条纹布' } });
      widthInput.props.onChange({ target: { value: '40' } });
      heightInput.props.onChange({ target: { value: '30' } });
    });
    await act(async () => {
      findButton(form, '保存布料').props.onClick();
    });

    expect(request).toHaveBeenCalledWith(
      '/fabrics',
      expect.objectContaining({ method: 'POST' }),
      'token-1',
    );
    const allCards = renderer.root.findAll((n) => n.type === 'article' && String(n.props.className).includes('fabric-card'));
    expect(allCards).toHaveLength(3);
  });
});
