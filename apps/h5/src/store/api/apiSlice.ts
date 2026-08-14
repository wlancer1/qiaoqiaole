import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedBaseQuery } from './baseQuery';

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: authenticatedBaseQuery,
  tagTypes: [
    'CommunityPost',
    'CommunityComment',
    'CommunityProfile',
    'CommunityRelation',
    'Notification',
    'Project',
    'ProjectFolder',
    'Warehouse',
  ],
  keepUnusedDataFor: 120,
  endpoints: () => ({}),
});
