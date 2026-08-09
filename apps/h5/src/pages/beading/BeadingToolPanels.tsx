import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

type Requirement = { colorCode: string; required: number };

type ClosedPanelProps = { activePanel: null };

type SearchPanelProps = {
  activePanel: 'search';
  query: string;
  onQueryChange: (query: string) => void;
  requirements: Requirement[];
  completed: string[];
  current: string | null;
  resolveColor: (colorCode: string) => string;
  onSelect: (colorCode: string) => void;
  onClose: () => void;
};

type MorePanelProps = {
  activePanel: 'more';
  codesVisible: boolean;
  gridVisible: boolean;
  hasMarks: boolean;
  onToggleCodes: () => void;
  onToggleGrid: () => void;
  onClearMarks: () => void;
  onReset: () => void;
  onClose: () => void;
};

export type BeadingToolPanelsProps = ClosedPanelProps | SearchPanelProps | MorePanelProps;

const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function BeadingToolPanels(props: BeadingToolPanelsProps) {
  const { activePanel } = props;
  const onClose = activePanel === null ? undefined : props.onClose;
  const onCloseRef = useRef(onClose);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (activePanel === null) return undefined;
    const previousFocus = typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null;
    const backdrop = backdropRef.current;
    const siblings = typeof document === 'undefined' || !backdrop?.parentElement
      ? []
      : Array.from(backdrop.parentElement.children)
        .filter((element) => element !== backdrop)
        .map((element) => {
          const htmlElement = element as HTMLElement;
          return { element: htmlElement, inert: htmlElement.inert, ariaHidden: htmlElement.getAttribute('aria-hidden') };
        });
    siblings.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });

    const initialFocus = activePanel === 'search' ? searchInputRef.current : closeButtonRef.current;
    (initialFocus ?? dialogRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || typeof document === 'undefined') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('keydown', onKeyDown);
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeyDown);
      siblings.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      if (previousFocus && previousFocus.isConnected !== false) previousFocus.focus();
    };
  }, [activePanel]);

  if (activePanel === null) return null;

  const closeFromBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) props.onClose();
  };

  if (activePanel === 'search') {
    const normalizedQuery = props.query.trim().toUpperCase();
    const completed = new Set(props.completed);
    const visibleRequirements = props.requirements.filter(({ colorCode }) => colorCode.toUpperCase().includes(normalizedQuery));
    return <div ref={backdropRef} className="beading-tool-panel-backdrop" role="presentation" onClick={closeFromBackdrop}>
      <section ref={dialogRef} className="beading-sheet beading-search-panel" role="dialog" aria-modal="true" aria-label="搜色" tabIndex={-1}>
        <span className="beading-sheet-handle" aria-hidden="true" />
        <header className="beading-sheet-header">
          <h2>搜色</h2>
          <button ref={closeButtonRef} type="button" aria-label="关闭搜色" onClick={props.onClose}><X /></button>
        </header>
        <label className="beading-search-input">
          <Search aria-hidden="true" />
          <span className="sr-only">搜索作品色号</span>
          <input ref={searchInputRef} value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="输入色号" />
        </label>
        <div className="beading-search-results">
          {visibleRequirements.length === 0 ? <p className="beading-search-empty">无结果</p> : visibleRequirements.map((item) => {
            const isComplete = completed.has(item.colorCode);
            return <button
              type="button"
              key={item.colorCode}
              className="beading-search-result"
              aria-current={props.current === item.colorCode ? 'true' : undefined}
              onClick={() => {
                props.onSelect(item.colorCode);
                props.onClose();
              }}
            >
              <span className="beading-color-swatch" style={{ backgroundColor: props.resolveColor(item.colorCode) }} aria-hidden="true" />
              <strong className="beading-search-result-code">{item.colorCode}</strong>
              <span className="beading-search-result-required">需要 {item.required}</span>
              <span className="beading-search-result-remaining">剩余 {isComplete ? 0 : item.required}</span>
            </button>;
          })}
        </div>
      </section>
    </div>;
  }

  return <div ref={backdropRef} className="beading-tool-panel-backdrop" role="presentation" onClick={closeFromBackdrop}>
    <section ref={dialogRef} className="beading-sheet beading-more-panel" role="dialog" aria-modal="true" aria-label="更多工具" tabIndex={-1}>
      <span className="beading-sheet-handle" aria-hidden="true" />
      <header className="beading-sheet-header">
        <h2>更多工具</h2>
        <button ref={closeButtonRef} type="button" aria-label="关闭更多工具" onClick={props.onClose}><X /></button>
      </header>
      <div className="beading-more-actions">
        <button type="button" aria-label="显示色号" aria-pressed={props.codesVisible} onClick={props.onToggleCodes}>显示色号</button>
        <button type="button" aria-label="显示网格" aria-pressed={props.gridVisible} onClick={props.onToggleGrid}>显示网格</button>
        <button type="button" aria-label="清除标记" disabled={!props.hasMarks} onClick={props.onClearMarks}>清除标记</button>
        <button type="button" aria-label="重置工具" onClick={props.onReset}>重置工具</button>
      </div>
    </section>
  </div>;
}
