export const COMMUNITY_TAGS = ['动物', '人物', '植物', '食物', '风景', '动漫', '游戏', '节日', '文字', '新手', '其他'] as const;
export type CommunityTag = typeof COMMUNITY_TAGS[number];

export function normalizeSelectedTags(tags: readonly string[]): CommunityTag[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter((tag): tag is CommunityTag => (COMMUNITY_TAGS as readonly string[]).includes(tag)))].slice(0, 3);
}
