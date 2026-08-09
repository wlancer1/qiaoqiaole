import { Flag, Lightbulb, Lock, Maximize, MoreHorizontal, Search } from 'lucide-react';
import type { ActivePanel, InteractionMode } from '../../beading/beadingToolState';

export type BeadingToolRowProps = {
  interactionMode: InteractionMode;
  activePanel: ActivePanel;
  highlightEnabled: boolean;
  locked: boolean;
  currentColor: string | null;
  pending?: boolean;
  onSearch: () => void;
  onToggleMark: () => void;
  onToggleHighlight: () => void;
  onToggleLock: () => void;
  onMore: () => void;
  onFit: () => void;
};

type ToolButtonProps = {
  label: string;
  active?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function ToolButton({ label, active = false, pressed, disabled = false, onClick, children }: ToolButtonProps) {
  return <button
    type="button"
    className={`beading-tool-button${active ? ' is-active' : ''}`}
    aria-label={label}
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
  >
    {children}<span>{label === '锁定画布' || label === '解除画布锁定' ? '锁定' : label === '更多工具' ? '更多' : label === '适应画布' ? '适应' : label}</span>
  </button>;
}

export function BeadingToolRow({
  interactionMode,
  activePanel,
  highlightEnabled,
  locked,
  currentColor,
  onSearch,
  onToggleMark,
  onToggleHighlight,
  onToggleLock,
  onMore,
  onFit,
}: BeadingToolRowProps) {
  const markActive = interactionMode === 'mark';
  return <section className="beading-tool-row" aria-label="拼豆工具">
    <ToolButton label="搜色" active={activePanel === 'search'} pressed={activePanel === 'search'} onClick={onSearch}><Search /></ToolButton>
    <ToolButton label="标记" active={markActive} pressed={markActive} disabled={locked || currentColor === null} onClick={onToggleMark}><Flag /></ToolButton>
    <ToolButton label="高亮" active={highlightEnabled} pressed={highlightEnabled} onClick={onToggleHighlight}><Lightbulb /></ToolButton>
    <ToolButton label={locked ? '解除画布锁定' : '锁定画布'} active={locked} pressed={locked} onClick={onToggleLock}><Lock /></ToolButton>
    <ToolButton label="更多工具" active={activePanel === 'more'} pressed={activePanel === 'more'} onClick={onMore}><MoreHorizontal /></ToolButton>
    <ToolButton label="适应画布" onClick={onFit}><Maximize /></ToolButton>
  </section>;
}
