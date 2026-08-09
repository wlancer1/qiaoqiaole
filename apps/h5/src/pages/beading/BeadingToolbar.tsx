import { ArrowLeft, Package, Pause, Play, Save, Settings } from 'lucide-react';

export type BeadingPendingAction = null | 'save' | 'inventory' | 'patch' | 'prepare' | 'complete' | 'resume';

export type BeadingToolbarProps = {
  elapsed: string;
  paused: boolean;
  progress: { completed: number; total: number; percent: number };
  pendingAction?: BeadingPendingAction;
  focusMode?: boolean;
  onExit: () => void;
  onInventory?: () => void;
  onTogglePause: () => void;
  onSave: () => void;
  onSettings?: () => void;
  /** Kept temporarily for callers from the previous session page; intentionally not rendered. */
  title?: string;
};

export function BeadingToolbar({
  elapsed,
  paused,
  progress,
  pendingAction,
  focusMode = false,
  onExit,
  onInventory,
  onTogglePause,
  onSave,
  onSettings,
}: BeadingToolbarProps) {
  const isPending = (action: Exclude<BeadingPendingAction, null>) => pendingAction === action;
  const percent = Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : 0;
  const hasPendingAction = pendingAction !== null && pendingAction !== undefined;

  return <>
    <header className={`beading-toolbar${focusMode ? ' is-focus-mode' : ''}`}>
      <button type="button" aria-label="返回" disabled={false} onClick={onExit}>
        <ArrowLeft />
      </button>
      <div className="beading-toolbar-actions">
        <button
          type="button"
          className="beading-toolbar-capsule beading-toolbar-secondary"
          aria-label="查看库存"
          disabled={isPending('inventory') || !onInventory}
          onClick={onInventory}
        >
          <Package /><span className="beading-toolbar-label">库存</span>
        </button>
        <button
          type="button"
          className="beading-toolbar-capsule beading-timer"
          aria-label={paused ? '继续计时' : '暂停计时'}
          disabled={isPending('resume')}
          onClick={onTogglePause}
        >
          <span>{elapsed}</span>{paused ? <Play /> : <Pause />}
        </button>
        <button
          type="button"
          className="beading-toolbar-capsule beading-toolbar-secondary beading-toolbar-save"
          aria-label="保存"
          disabled={hasPendingAction}
          onClick={onSave}
        >
          <Save /><span className="beading-toolbar-label">保存</span>
        </button>
        <button
          type="button"
          className="beading-toolbar-secondary"
          aria-label="设置"
          disabled={!onSettings}
          onClick={onSettings}
        >
          <Settings />
        </button>
      </div>
    </header>
    <div
      className="beading-progress-bar"
      role="progressbar"
      aria-label={`完成 ${progress.completed}/${progress.total}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className="beading-progress-track" aria-hidden="true">
        <span className="beading-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <strong>{percent}%</strong>
    </div>
  </>;
}
