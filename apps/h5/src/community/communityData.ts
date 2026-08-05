import type { PatternListCard } from '../shared/h5Types';

export type CommunityPost = {
  id: string;
  name: string;
  author: string;
  rows: number;
  cols: number;
  tone: string;
  thumbnailImage?: string;
  sourceImage?: string;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  sharedAt: string;
};

export type CommunityComment = {
  id: string;
  projectId: string;
  author: string;
  content: string;
  createdAt: string;
};

export function sortCommunityPosts<T extends { likesCount: number; sharedAt: string }>(posts: T[]): T[] {
  return [...posts].sort((a, b) => b.likesCount - a.likesCount || Date.parse(b.sharedAt) - Date.parse(a.sharedAt));
}

export function toPatternListCard(post: CommunityPost): PatternListCard {
  return {
    id: post.id,
    title: post.name,
    author: post.author,
    size: `${post.cols} × ${post.rows}`,
    meta: post.sharedAt,
    likes: String(post.likesCount),
    comments: String(post.commentsCount),
    downloads: '0',
    tone: post.tone,
    beads: [],
    image: post.thumbnailImage || post.sourceImage || '',
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    likedByMe: post.likedByMe,
  };
}
