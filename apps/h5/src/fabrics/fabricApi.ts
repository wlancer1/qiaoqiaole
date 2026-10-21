import { apiSlice } from '../store/api/apiSlice';
import { authExtraOptions } from '../store/api/baseQuery';
import type { FabricItem } from '../patchwork/fabricInventory';
export type FabricPage = { fabrics: FabricItem[]; page: number; pageSize: number; hasMore: boolean; ownedPresetIds: string[] };
export const fabricApi = apiSlice.injectEndpoints({ endpoints: build => ({
 browseFabrics: build.infiniteQuery<FabricPage, { accountId: string; query: string }, number>({
  infiniteQueryOptions: { initialPageParam: 1, getNextPageParam: last => last.hasMore ? last.page + 1 : undefined },
  query: ({queryArg,pageParam}) => ({url:'/fabrics/browse',params:{page:pageParam,pageSize:16,q:queryArg.query}}),
  extraOptions: authExtraOptions('required'), providesTags:['Inventory'],
 }),
}) });
