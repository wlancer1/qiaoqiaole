import { FolderInput, Pencil, PlayCircle, Share2, Trash2, X } from 'lucide-react';
import type { RecentProject } from '../../shared/h5Types';

export function ProjectActionSheet({ project, hasSession, onClose, onStart, onEdit, onShare, onDelete, onMove }: {
  project: RecentProject;
  hasSession: boolean;
  onClose: () => void;
  onStart: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
  onMove: () => void;
}) {
  return <div className="beading-sheet-backdrop project-action-modal" role="presentation" onClick={onClose}>
    <section className="beading-sheet project-action-sheet" role="dialog" aria-modal="true" aria-label="作品操作" onClick={(event) => event.stopPropagation()}>
      <span className="beading-sheet-handle" aria-hidden="true" />
      <header className="beading-sheet-header project-action-header">
        <div><p className="beading-eyebrow">我的作品</p><h2>{project.name}</h2></div>
        <button type="button" className="project-action-close" aria-label="关闭作品操作" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <div className="project-action-grid">
        <button type="button" className="project-action-tile is-primary" onClick={onStart}>
          <PlayCircle className="ui-icon" aria-hidden="true" />
          {hasSession ? '继续拼豆' : '开始拼豆'}
        </button>
        <button type="button" className="project-action-tile" onClick={onEdit}>
          <Pencil className="ui-icon" aria-hidden="true" />
          编辑作品
        </button>
        <button type="button" className="project-action-tile project-action-folder" onClick={onMove}>
          <FolderInput className="ui-icon" aria-hidden="true" />
          移动到文件夹
        </button>
        <button type="button" className="project-action-tile" onClick={onShare}>
          <Share2 className="ui-icon" aria-hidden="true" />
          {project.sharedToCommunity ? '编辑标签' : '分享作品'}
        </button>
        <button type="button" className="project-action-tile is-danger" onClick={onDelete}>
          <Trash2 className="ui-icon" aria-hidden="true" />
          删除作品
        </button>
      </div>
    </section>
  </div>;
}
