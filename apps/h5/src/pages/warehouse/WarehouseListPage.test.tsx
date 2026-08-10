import { act, create } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WarehouseListPage } from './WarehouseListPage';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('WarehouseListPage', () => {
  it('does not forward the click event as the warehouse auth token', () => {
    const createWarehouse = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<WarehouseListPage
        status=""
        setActiveTab={vi.fn()}
        setScreen={vi.fn()}
        warehouses={[]}
        activeWarehouseId=""
        openWarehouseDetail={vi.fn()}
        showWarehouseCreateModal
        setShowWarehouseCreateModal={vi.fn()}
        warehouseName="常用色仓库"
        setWarehouseName={vi.fn()}
        warehouseRemark=""
        setWarehouseRemark={vi.fn()}
        createWarehouse={createWarehouse}
        deleteWarehouse={vi.fn()}
        requestConfirm={vi.fn()}
        confirmDialog={null}
      />);
    });

    const submit = renderer.root.findAllByType('button').find((button) => button.children.includes('创建仓库'))!;
    act(() => submit.props.onClick({ type: 'click' }));

    expect(createWarehouse).toHaveBeenCalledWith();
  });
});
