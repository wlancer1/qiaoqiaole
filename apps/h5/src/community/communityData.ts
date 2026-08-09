import type { PatternListCard } from '../shared/h5Types';

export type CommunityPost = {
  id: string;
  name: string;
  author: string;
  authorId?: string;
  isFollowing?: boolean;
  rows: number;
  cols: number;
  tone: string;
  thumbnailImage?: string;
  sourceImage?: string;
  beadList?: Array<{ color: string; count: number }>;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  sharedAt: string;
};

export type CommunityComment = {
  id: string;
  projectId: string;
  author: string;
  authorAvatar: string | null;
  content: string;
  createdAt: string;
  authorId?: string;
};

export type CommunityNotification = {
  id: string;
  type: string;
  projectId?: string;
  commentId?: string;
  content: string;
  createdAt: string;
  readAt?: string | null;
  isRead: boolean;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
};

export function formatPatternSizeCm(cols: number, rows: number): string {
  const toCm = (count: number) => Number(((count * 2.6) / 10).toFixed(2)).toString();
  return `${toCm(cols)} × ${toCm(rows)} cm`;
}

export function formatCommunityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

export function sortCommunityPosts<T extends { likesCount: number; sharedAt: string }>(posts: T[]): T[] {
  return [...posts].sort((a, b) => b.likesCount - a.likesCount || Date.parse(b.sharedAt) - Date.parse(a.sharedAt));
}

export function toPatternListCard(post: CommunityPost): PatternListCard {
  return {
    id: post.id,
    title: post.name,
    author: post.author,
    authorId: post.authorId,
    isFollowing: post.isFollowing,
    size: `${post.cols} × ${post.rows}`,
    meta: formatCommunityTime(post.sharedAt),
    likes: String(post.likesCount),
    comments: String(post.commentsCount),
    downloads: '0',
    tone: post.tone,
    beads: [],
    beadList: post.beadList || [],
    image: post.thumbnailImage || post.sourceImage || '',
    detailImage: post.thumbnailImage || post.sourceImage || '',
    imageAspectRatio: `${post.cols} / ${post.rows}`,
    physicalSize: formatPatternSizeCm(post.cols, post.rows),
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    likedByMe: post.likedByMe,
  };
}
