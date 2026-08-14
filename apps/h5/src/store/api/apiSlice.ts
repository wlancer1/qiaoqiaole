import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedBaseQuery } from './baseQuery';

export const API_TAG_TYPES = [
  'CommunityPost',
  'CommunityComment',
  'CommunityProfile',
  'CommunityRelation',
  'Notification',
  'Project',
  'ProjectFolder',
  'Warehouse',
  'Inventory',
  'BeadingSession',
] as const;

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: authenticatedBaseQuery,
  tagTypes: [...API_TAG_TYPES],
  keepUnusedDataFor: 120,
  endpoints: () => ({}),
});
