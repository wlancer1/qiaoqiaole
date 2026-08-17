import { useId, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Image } from 'lucide-react';

export function HomeUploadHero({ onUpload }: { onUpload: () => void }) {
  return (
    <button className="home-upload-hero" type="button" aria-label="上传图片制作拼豆图纸" onClick={onUpload}>
      <span className="home-upload-copy">
        <strong>上传图片<br />制作拼豆图纸</strong>
        <small>支持 PNG / JPG / WebP</small>
      </span>
      <span className="home-upload-watermark" aria-hidden="true">
        <Image aria-hidden="true" />
      </span>
      <span className="home-upload-arrow" aria-hidden="true">
        <ArrowRight aria-hidden="true" />
      </span>
    </button>
  );
}

export type FlowTopbarProps = {
  title: string;
  backLabel: string;
  onBack: () => void;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    primary?: boolean;
  };
};

export function getImportAction(cellCount: number, onClick: () => void) {
  return { label: '导入画布', onClick, disabled: cellCount === 0, primary: true };
}

export function FlowTopbar({ title, backLabel, onBack, action }: FlowTopbarProps) {
  return (
    <header className="split-topbar">
      <button className="split-icon-btn" type="button" aria-label={backLabel} onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
      </button>
      <h1 className="split-topbar-title">{title}</h1>
      {action ? (
        <button
          className={`split-action-btn${action.primary ? ' split-action-btn--primary' : ''}`}
          type="button"
          disabled={action.disabled}
          onClick={action.disabled ? undefined : action.onClick}
        >
          {action.label}
        </button>
      ) : <span className="split-topbar-spacer" aria-hidden="true" />}
    </header>
  );
}

export type SplitCanvasLoadingProps = {
  rows: number;
  cols: number;
  title?: string;
  stage: string;
  progress: number;
};

export function SplitCanvasLoading({ rows, cols, title = '像素生成中', stage, progress }: SplitCanvasLoadingProps) {
  const pixels = Array.from({ length: 25 }, (_, index) => index);
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="split-canvas-loading" role="status" aria-busy="true" aria-label={title}>
      <div className="split-canvas-loading-grid" aria-hidden="true">
        {pixels.map((pixel) => <i className="split-canvas-loading-pixel" key={pixel} />)}
      </div>
      <strong>{title}</strong>
      <p>{stage}</p>
      {rows > 0 && cols > 0 ? <span className="split-canvas-loading-size">正在生成 {cols} × {rows} 格画布</span> : null}
      <div className="split-canvas-loading-progress" aria-label={`生成进度 ${safeProgress}%`}>
        <span style={{ width: `${safeProgress}%` }} />
      </div>
      <output>{safeProgress}%</output>
    </div>
  );
}

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  badge?: number;
};

type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  idPrefix?: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ ariaLabel, idPrefix, value, options, onChange }: SegmentedControlProps<T>) {
  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, index: number, delta: number) => {
    event.preventDefault();
    const nextIndex = (index + delta + options.length) % options.length;
    onChange(options[nextIndex].value);
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIndex]?.focus();
  };

  return (
    <div className="flow-segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            className={selected ? 'is-active' : ''}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-${option.value}-tab` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-${option.value}-panel` : undefined}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') moveSelection(event, index, -1);
              if (event.key === 'ArrowRight') moveSelection(event, index, 1);
            }}
          >
            <span>{option.label}</span>
            {option.badge === undefined ? null : <small>{option.badge}</small>}
          </button>
        );
      })}
    </div>
  );
}

type ThresholdControlProps = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

export function ThresholdControl({ value, min, max, onChange }: ThresholdControlProps) {
  const rangeId = useId();

  return (
    <section className="split-threshold-control split-merge-controls" aria-label="颜色合并设置">
      <div className="split-threshold-head">
        <strong>去杂色合并</strong>
        <output htmlFor={rangeId}>≤ {value}</output>
      </div>
      <div className="split-threshold-row">
        <span>减少</span>
        <input
          id={rangeId}
          type="range"
          aria-label="颜色合并阈值"
          min={min}
          max={max}
          step="1"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span>增加</span>
      </div>
      <p className="split-threshold-help">低用量颜色会自动并入最接近的常用色，减少成品杂点。</p>
    </section>
  );
}

export type BeadColorItem = { color: string; code: string; count: number };

export function SplitBeadList({ colors, totalBeads }: { colors: readonly BeadColorItem[]; totalBeads: number }) {
  return (
    <section className="split-bead-list-panel" aria-label="豆子清单">
      <div className="split-bead-stats" aria-label="豆子统计">
        <div>
          <span>颜色种类</span>
          <strong>{colors.length}</strong>
        </div>
        <div>
          <span>总豆子数</span>
          <strong>{totalBeads.toLocaleString('en-US')}</strong>
        </div>
      </div>
      <div className="split-bead-list-summary">
        <span>色号</span>
        <span>颜色</span>
        <span>数量</span>
        <span>占比</span>
      </div>
      <div className="split-bead-list">
        {colors.map((item) => {
          const hex = item.color.toUpperCase();
          const percent = totalBeads > 0 ? `${((item.count / totalBeads) * 100).toFixed(1)}%` : '0.0%';
          return (
            <div className="split-bead-row" data-count={item.count} key={`${item.code}-${item.color}`}>
              <strong className="split-bead-code">{item.code}</strong>
              <span className="split-bead-color-cell">
                <span className="split-bead-swatch" aria-label={`颜色 ${hex}`} style={{ backgroundColor: item.color }} />
                <span className="split-bead-hex">{hex}</span>
              </span>
              <span className="split-bead-count">× {item.count.toLocaleString('en-US')}</span>
              <span className="split-bead-percent">{percent}</span>
            </div>
          );
        })}
      </div>
      <p className="split-bead-hint"><span aria-hidden="true">◉</span> 点击颜色可在预览中高亮显示</p>
    </section>
  );
}

export function BeadListDrawer({ colors, totalBeads, onClose, description = '按当前画布实时统计颜色和数量', onInventoryCheck, onStartBeading }: { colors: readonly BeadColorItem[]; totalBeads: number; onClose: () => void; description?: string; onInventoryCheck?: () => void; onStartBeading?: () => void }) {
  return (
    <div className="split-bead-drawer-backdrop split-preview-page" role="presentation" onClick={onClose}>
      <section className="split-bead-drawer split-bead-sheet" role="dialog" aria-modal="true" aria-label="豆子清单" onClick={(event) => event.stopPropagation()}>
        <span className="split-bead-drawer-handle" aria-hidden="true" />
        <header className="split-bead-drawer-header">
          <h2>豆子清单</h2>
          <button type="button" aria-label="关闭豆子清单" onClick={onClose}>×</button>
        </header>
        <p className="split-bead-drawer-copy">{description}</p>
        <SplitBeadList colors={colors} totalBeads={totalBeads} />
        {onInventoryCheck || onStartBeading ? <footer className="beading-sheet-actions bead-list-actions">{onInventoryCheck ? <button type="button" className="beading-secondary-btn" onClick={onInventoryCheck}>检测库存</button> : null}{onStartBeading ? <button type="button" className="beading-primary-btn" onClick={onStartBeading}>开始拼豆</button> : null}</footer> : null}
      </section>
    </div>
  );
}
