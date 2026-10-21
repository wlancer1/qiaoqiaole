import { useEffect, useRef } from 'react';
import { FabricPicker, type FabricPickerProps } from '../patchwork/FabricPicker';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fabricApi } from './fabricApi';
/** All authenticated pickers share paginated account-scoped catalog data. */
export function ConnectedFabricPicker(props: FabricPickerProps) {
 const auth = useAppSelector(state => state.auth);
 const dispatch = useAppDispatch();
 const accountId = auth.status === 'authenticated' ? auth.user?.id || '' : '';
 const result = fabricApi.useBrowseFabricsInfiniteQuery({accountId,query:props.query.trim()}, {skip:!accountId});
 const inventoryKey = props.warehouseFabrics?.map(f=>[f.id,f.updatedAt,f.availableAreaMm2].join(':')).join('|');
 const previousInventory = useRef(inventoryKey);
 useEffect(() => {
  if (previousInventory.current !== inventoryKey && accountId) dispatch(fabricApi.util.invalidateTags(['Inventory']));
  previousInventory.current = inventoryKey;
 }, [inventoryKey,accountId,dispatch]);
 if (!accountId) return <FabricPicker {...props}/>;
 const pages = result.currentData?.pages || [];
 return <FabricPicker {...props} warehouseFabrics={pages.flatMap(page=>page.fabrics)}
  remoteCatalog={{hasMore:!pages.length || Boolean(result.hasNextPage),loading:result.isFetching,error:Boolean(result.isError),ownedPresetIds:pages[0]?.ownedPresetIds || [],
   loadMore:()=>{if(!result.isFetching && !result.isError) void result.fetchNextPage();},
   retry:()=>{void result.refetch();}}}/>;
}
