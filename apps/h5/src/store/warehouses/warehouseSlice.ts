import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Warehouse } from '../../shared/h5Types';
import { fetchWarehouseInventory, fetchWarehouses } from './warehouseThunks';

export type WarehouseState = {
  items: Warehouse[];
  activeId: string;
  inventory: Record<string, number>;
};

type WarehouseRootState = { warehouses: WarehouseState };

const initialState: WarehouseState = { items: [], activeId: '', inventory: {} };

const warehouseSlice = createSlice({
  name: 'warehouses',
  initialState,
  reducers: {
    warehousesLoaded: (state, action: PayloadAction<Warehouse[]>) => { state.items = action.payload; },
    activeWarehouseChanged: (state, action: PayloadAction<string>) => { state.activeId = action.payload; },
    inventoryLoaded: (state, action: PayloadAction<Record<string, number>>) => { state.inventory = action.payload; },
    warehousesCleared: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(fetchWarehouses.fulfilled, (state, action) => { state.items = action.payload; })
      .addCase(fetchWarehouseInventory.fulfilled, (state, action) => { state.inventory = action.payload; });
  },
});

export const { warehousesLoaded, activeWarehouseChanged, inventoryLoaded, warehousesCleared } = warehouseSlice.actions;
export const warehouseReducer = warehouseSlice.reducer;
export const selectWarehouses = (state: WarehouseRootState) => state.warehouses.items;
export const selectActiveWarehouseId = (state: WarehouseRootState) => state.warehouses.activeId;
export const selectWarehouseInventory = (state: WarehouseRootState) => state.warehouses.inventory;
export const selectActiveWarehouse = createSelector([selectWarehouses, selectActiveWarehouseId], (items, id) => items.find((item) => item.id === id) ?? null);
