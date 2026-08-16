import type { RecentProject } from '../../shared/h5Types';

export function toProjectSummary(project: RecentProject): RecentProject {
  const { canvasData: _canvasData, beadList: _beadList, sourceImage: _sourceImage, thumbnailImage, ...summary } = project as RecentProject & { beadList?: unknown };
  return { ...summary, ...(thumbnailImage?.startsWith('data:') ? { thumbnailImage: '' } : thumbnailImage ? { thumbnailImage } : {}) };
}
