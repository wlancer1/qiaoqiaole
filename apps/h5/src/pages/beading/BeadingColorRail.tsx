import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { SortMode } from '../../beading/beadingToolState';

type Requirement = { colorCode: string; required: number };

export type BeadingColorRailProps = {
  requirements: Requirement[];
  completed: string[];
  current: string | null;
  sortMode?: SortMode;
  resolveColor?: (colorCode: string) => string;
  resolveTextColor?: (color: string) => string;
  pending?: boolean;
  terminalPrepare?: boolean;
  revisionActive?: boolean;
  onSelect: (colorCode: string) => void;
  onSort?: () => void;
  onRevise?: () => void;
  onComplete?: () => void;
  /** Temporary alias used by the previous session page. */
  onCompleteColor?: () => void;
};

const sortLabels: Record<SortMode, { short: string; accessible: string }> = {
  canvas: { short: '数量', accessible: '剩余数量' },
  remaining: { short: '数量', accessible: '剩余数量' },
  code: { short: '色号', accessible: '色号顺序' },
};

export function BeadingColorRail({
  requirements,
  completed,
  current,
  sortMode = 'canvas',
  resolveColor = () => '#edf2fb',
  resolveTextColor = () => '#34465f',
  pending = false,
  terminalPrepare = false,
  revisionActive = false,
  onSelect,
  onSort,
  onRevise,
  onComplete,
  onCompleteColor,
}: BeadingColorRailProps) {
  const completedCodes = new Set(completed);
  const completedCount = requirements.filter(({ colorCode }) => completedCodes.has(colorCode)).length;
  const complete = onComplete ?? onCompleteColor;
  const currentIsComplete = current !== null && completedCodes.has(current);

  return <section className="beading-color-section" aria-label="拼豆色号进度">
    <div className="beading-color-rail">
      {requirements.map((item) => {
        const done = completedCodes.has(item.colorCode);
        const color = resolveColor(item.colorCode);
        const isCurrent = current === item.colorCode;
        return <button
          type="button"
          key={item.colorCode}
          className={`beading-color-chip${isCurrent ? ' is-current' : ''}${done ? ' is-complete' : ''}`}
          aria-label={`选择色号 ${item.colorCode}${isCurrent ? '，当前' : ''}${done ? '，已完成' : ''}`}
          aria-current={isCurrent ? 'true' : undefined}
          disabled={false}
          onClick={() => onSelect(item.colorCode)}
        >
          <span className="beading-color-swatch" style={{ backgroundColor: color, color: resolveTextColor(color) }}>
            {done ? <span className="beading-color-complete-badge" aria-label="已完成"><Check /></span> : null}
            <strong>{item.colorCode}</strong>
          </span>
          <span className="beading-color-count">{item.required}颗</span>
        </button>;
      })}
    </div>
    <div className="beading-color-actions">
      <button
        type="button"
        className="beading-color-sort"
        aria-label={`切换排序，当前${sortLabels[sortMode].accessible}`}
        disabled={!onSort}
        onClick={onSort}
      >
        <SlidersHorizontal /><span>{sortLabels[sortMode].short}</span>
      </button>
      {/* <button
        type="button"
        className={`beading-color-revise${revisionActive ? ' is-active' : ''}`}
        aria-label="修订当前色"
        aria-pressed={revisionActive}
        disabled={current === null || !onRevise}
        onClick={onRevise}
      >
        <RotateCcw /><span>修订</span>
      </button> */}
      <button
        type="button"
        className="beading-complete-color"
        aria-label={terminalPrepare ? '确认完成拼豆' : '完成当前色'}
        disabled={pending || !complete || (!terminalPrepare && (current === null || currentIsComplete))}
        onClick={complete}
      >
        {terminalPrepare ? '确认完成' : `完成 ${completedCount}/${requirements.length}`}
      </button>
    </div>
  </section>;
}
