export type WarehouseRoute = { kind: 'list' } | { kind: 'detail'; warehouseId: string };

export function parseWarehouseRoute(pathname: string): WarehouseRoute | null {
  if (pathname === '/warehouses' || pathname === '/warehouses/') return { kind: 'list' };
  const match = pathname.match(/^\/warehouses\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    const warehouseId = decodeURIComponent(match[1]);
    return warehouseId ? { kind: 'detail', warehouseId } : null;
  } catch {
    return null;
  }
}
