import type { RecentProject } from '../shared/h5Types';
import { normalizeSelectedTags } from './communityTags';
import { CommunityTagSelector } from './CommunityTagSelector';

export function ShareCommunityDialog({ project, tags, onTagsChange, onConfirm, onClose, isSaving, isShared = false }: {
  project: RecentProject;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  onConfirm: (tags: string[]) => void;
  onClose: () => void;
  isSaving: boolean;
  isShared?: boolean;
}) {
  const selectedTags = normalizeSelectedTags(tags);
  const canConfirm = selectedTags.length >= 1 && selectedTags.length <= 3 && !isSaving;
  const confirmLabel = isShared ? '保存社区标签' : '确认发布';
  return (
    <div className="share-community-modal" role="dialog" aria-modal="true" aria-labelledby="share-community-title" onClick={() => { if (!isSaving) onClose(); }}>
      <section className="share-community-panel" onClick={(event) => event.stopPropagation()}>
        <h2 id="share-community-title">{isShared ? '编辑社区标签' : '发布到社区'}</h2>
        <div className="share-community-project"><strong>{project.name}</strong><span>{project.cols} × {project.rows} 格</span></div>
        <p>发布后，所有用户都可以浏览、点赞和评论。</p>
        <div className="share-community-tags-head"><strong>选择标签</strong><span>1–3 个</span></div>
        <CommunityTagSelector value={selectedTags} onChange={onTagsChange} disabled={isSaving} />
        {selectedTags.length === 0 ? <small className="share-community-hint">请至少选择一个标签</small> : selectedTags.length >= 3 ? <small className="share-community-hint">最多选择 3 个标签</small> : null}
        <footer>
          <button type="button" onClick={onClose} disabled={isSaving}>取消</button>
          <button type="button" aria-label={confirmLabel} disabled={!canConfirm} onClick={() => { if (canConfirm) onConfirm(selectedTags); }}>{isSaving ? '处理中…' : confirmLabel}</button>
        </footer>
      </section>
    </div>
  );
}
