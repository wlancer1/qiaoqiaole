import type { BackgroundRemovalCache, Cell } from '@qiaoqiaole/core';

export type AppScreen = 'home' | 'profile' | 'split' | 'split-crop' | 'split-preview' | 'canvas' | 'beading' | 'warehouse' | 'warehouse-detail' | 'pattern-detail' | 'author-profile' | 'my-works' | 'following' | 'followers';
export type CanvasTool = 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'pan';
export type WorkMode = 'bead' | 'peg';
export type SplitMode = 'quick' | 'align';
export type SplitPreviewTab = 'settings' | 'beads';
export type GridHandle = 'move' | 'scale';
export type GridHandlePosition = { x: number; y: number };
export type WarehouseUnit = 'count' | 'gram';
export type Warehouse = {
  id: string;
  name: string;
  remark: string;
  colorSystem: string;
  stockedColorCount?: number;
  totalWarehouseStock?: number;
};
export type XhsExtractedImage = { imageUrl?: string; imageDataUrl?: string };
export type ReferenceImage = { name: string; url: string };
export type HomeTab = 'home' | 'discover' | 'messages' | 'profile';
export type PatternListCard = {
  id: string;
  title: string;
  author: string;
  authorId?: string;
  authorAvatar?: string | null;
  isFollowing?: boolean;
  size: string;
  meta: string;
  likes: string;
  comments: string;
  downloads: string;
  tone: string;
  beads: string[];
  beadList?: Array<{ color: string; count: number }>;
  image: string;
  detailImage?: string;
  imageAspectRatio?: string;
  physicalSize?: string;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  tags?: string[];
};
export type RecentProject = {
  id: string;
  name: string;
  rows: number;
  cols: number;
  tone: string;
  createdAt: string;
  updatedAt: string;
  sourceImage?: string;
  thumbnailImage?: string;
  canvasData?: string;
  sharedToCommunity?: boolean;
  sharedAt?: string;
  likesCount?: number;
  folderId?: string | null;
  tags?: string[];
};
export type FollowingUser = { id: string; name: string; avatarUrl?: string | null };
export type AuthorProfile = FollowingUser & { postsCount: number; likesCount: number; followersCount: number; isFollowing: boolean };
export type IconName =
  | 'arrow-left'
  | 'bell'
  | 'brush'
  | 'category'
  | 'eraser'
  | 'eyedropper'
  | 'fill'
  | 'folder'
  | 'help'
  | 'home'
  | 'message'
  | 'layers'
  | 'plus'
  | 'profile'
  | 'discover'
  | 'settings'
  | 'share'
  | 'upload'
  | 'hand'
  | 'crop'
  | 'shape'
  | 'spark';

export type UploadedSplitImage = {
  name: string;
  originalImageData: ImageData;
  imageData: ImageData;
  crop: { x: number; y: number; width: number; height: number };
  url: string;
  originalUrl: string;
  backgroundRemoved: boolean;
  backgroundSensitivity: number;
  backgroundCache: BackgroundRemovalCache;
};

export type PaintStroke = {
  active: boolean;
  tool: 'brush' | 'eraser';
  baseCells: Cell[];
  draftCells: Cell[];
  changedCount: number;
  pointerId: number | null;
  lastCell: { x: number; y: number } | null;
  initialPainted: boolean;
};

export type AlignedGrid = {
  rows: number;
  cols: number;
  cellSize: number;
  offsetX: number;
  offsetY: number;
  cropWidth: number;
  cropHeight: number;
};
