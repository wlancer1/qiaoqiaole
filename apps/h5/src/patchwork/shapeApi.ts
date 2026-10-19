import { apiSlice } from '../store/api/apiSlice';
import { authExtraOptions } from '../store/api/baseQuery';
import type { ShapeTemplate } from './shapeLibrary';
import type { Point } from './model';
export type ShapeSummary = Omit<ShapeTemplate, 'points'> & { previewPoints: Point[] };
export type ShapePage = { shapes: ShapeSummary[]; page: number; pageSize: number; total: number; hasMore: boolean };
export type ShapeBrowse = { accountId: string; query: string; filter: 'recent' | 'favorite' | 'all' };
export const shapeApi = apiSlice.injectEndpoints({ endpoints: (build) => ({
  listPatchworkShapes: build.infiniteQuery<ShapePage, ShapeBrowse, number>({
    infiniteQueryOptions: { initialPageParam: 1, getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined },
    query: ({ queryArg, pageParam }) => ({ url: '/patchwork-shapes', params: { page: pageParam, pageSize: 30, q: queryArg.query, favorite: queryArg.filter === 'favorite' ? 'true' : undefined, sort: queryArg.filter } }),
    extraOptions: authExtraOptions('required'), providesTags: ['PatchworkShape'],
  }),
  getPatchworkShape: build.query<{ shape: ShapeTemplate }, { accountId: string; id: string }>({
    query: ({ id }) => `/patchwork-shapes/${encodeURIComponent(id)}`, extraOptions: authExtraOptions('required'), providesTags: ['PatchworkShape'],
  }),
  savePatchworkShape: build.mutation<{ saved: boolean }, { accountId: string; shape: ShapeTemplate }>({
    query: ({ shape }) => ({ url: `/patchwork-shapes/${encodeURIComponent(shape.id)}`, method: shape.remote ? 'PATCH' : 'PUT', body: shape.remote ? { name: shape.name, favorite: shape.favorite || false, lastUsedAt: shape.lastUsedAt || 0 } : { name: shape.name, points: shape.points, favorite: shape.favorite || false, lastUsedAt: shape.lastUsedAt || 0 } }),
    extraOptions: authExtraOptions('required'), invalidatesTags: (_r, error) => error ? [] : ['PatchworkShape'],
  }),
}) });
