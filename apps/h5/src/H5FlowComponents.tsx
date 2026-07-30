import { useId, type KeyboardEvent } from 'react';

export function HomeUploadHero({ onUpload }: { onUpload: () => void }) {
  return (
    <button className="home-upload-hero" type="button" aria-label="上传图片制作拼豆图纸" onClick={onUpload}>
      <span className="home-upload-copy">
        <strong>上传图片<br />制作拼豆图纸</strong>
        <small>支持 PNG / JPG / WebP</small>
      </span>
      <span className="home-upload-watermark" aria-hidden="true">
        <svg viewBox="0 0 48 48" focusable="false" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="9" width="34" height="30" rx="7" />
          <circle cx="18" cy="20" r="2.5" fill="currentColor" stroke="none" />
          <path d="m12 33 8.5-8.5 6.5 6.5 3.5-3.5L38 35" />
        </svg>
      </span>
      <span className="home-upload-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
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
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
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
