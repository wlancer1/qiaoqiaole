import { createAsyncThunk } from '@reduxjs/toolkit';
import type { Warehouse } from '../../shared/h5Types';

async function api<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: { authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || '请求失败');
  return payload as T;
}

export const fetchWarehouses = createAsyncThunk<Warehouse[], { token: string }, { rejectValue: string }>(
  'warehouses/fetchAll',
  async ({ token }, apiContext) => {
    try { return (await api<{ warehouses: Warehouse[] }>('/warehouses', token)).warehouses; }
    catch (error) { return apiContext.rejectWithValue(error instanceof Error ? error.message : '仓库读取失败'); }
  },
);

export const fetchWarehouseInventory = createAsyncThunk<Record<string, number>, { warehouseId: string; token: string }, { rejectValue: string }>(
  'warehouses/fetchInventory',
  async ({ warehouseId, token }, apiContext) => {
    try { return (await api<{ inventory: Record<string, number> }>(`/warehouses/${encodeURIComponent(warehouseId)}/inventory`, token)).inventory; }
    catch (error) { return apiContext.rejectWithValue(error instanceof Error ? error.message : '库存读取失败'); }
  },
);
