import type { RecentProject } from '../../shared/h5Types';

export function ProjectActionSheet({ project, hasSession, onClose, onStart, onEdit, onShare, onDelete }: {
  project: RecentProject;
  hasSession: boolean;
  onClose: () => void;
  onStart: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  return <div className="beading-sheet-backdrop" role="presentation" onClick={onClose}><section className="beading-sheet project-action-sheet" role="dialog" aria-modal="true" aria-label="作品操作" onClick={(event) => event.stopPropagation()}><span className="beading-sheet-handle" aria-hidden="true" /><header className="beading-sheet-header"><div><p className="beading-eyebrow">我的作品</p><h2>{project.name}</h2></div><button type="button" aria-label="关闭作品操作" onClick={onClose}>×</button></header><div className="project-action-list"><button type="button" onClick={onStart}>{hasSession ? '继续拼豆' : '开始拼豆'}</button><button type="button" onClick={onEdit}>编辑作品</button><button type="button" onClick={onShare}>分享作品</button><button type="button" className="is-danger" onClick={onDelete}>删除作品</button></div></section></div>;
}
