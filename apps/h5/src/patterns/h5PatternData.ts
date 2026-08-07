import type { IconName, WorkMode } from '../shared/h5Types';

export const quickTools: Array<{ title: string; description: string; icon: IconName; mode: WorkMode }> = [
  { title: '拼豆图纸', description: '上传图片生成', icon: 'spark', mode: 'bead' },
  { title: '截豆豆图纸', description: '导出 STL 模型', icon: 'layers', mode: 'peg' },
];
