import { act, create } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WarehouseListPage } from './WarehouseListPage';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('WarehouseListPage', () => {
  it('delegates opening the create overlay to the feature controller', () => {
    const openCreate = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<WarehouseListPage
        status=""
        warehouses={[]}
        activeWarehouseId=""
        openWarehouseDetail={vi.fn()}
        openCreate={openCreate}
        deleteWarehouse={vi.fn()}
        requestConfirm={vi.fn()}
        onBack={vi.fn()}
      />);
    });

    const createButton = renderer.root.findAllByType('button').find((button) => button.children.includes('新建豆子仓库'))!;
    act(() => createButton.props.onClick({ type: 'click' }));

    expect(openCreate).toHaveBeenCalledWith();
  });
});
