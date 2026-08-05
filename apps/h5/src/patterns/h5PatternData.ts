import type { IconName, WorkMode } from '../shared/h5Types';

export const patternSortTabs = ['推荐', '最新', '热门'];
export const patternFilters = ['全部', '动物', '人物', '植物'];

export const quickTools: Array<{ title: string; description: string; icon: IconName; mode: WorkMode }> = [
  { title: '拼豆图纸', description: '上传图片生成', icon: 'spark', mode: 'bead' },
  { title: '截豆豆图纸', description: '导出 STL 模型', icon: 'layers', mode: 'peg' },
];

export const homeTemplateFilters = ['推荐', '宠物', '动漫', '风景', '游戏', '卡通'];
