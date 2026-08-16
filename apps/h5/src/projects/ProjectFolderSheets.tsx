import { FolderPlus, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import type { ProjectFolder } from './projectFolders';

type FocusTargetRef = RefObject<HTMLElement | null>;

const escapeSheetStack: object[] = [];
let escapeSheetWindow: EventTarget | undefined;

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ProjectFolderSheetShellProps = {
  title: string;
  description?: string;
  pending: boolean;
  covered?: boolean;
  onClose: () => void;
  returnFocusRef?: FocusTargetRef;
  initialFocus?: () => HTMLElement | null;
  children: ReactNode;
  footer: ReactNode;
};

export function ProjectFolderSheetShell({ title, description, pending, covered = false, onClose, returnFocusRef, initialFocus, children, footer }: ProjectFolderSheetShellProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const sheetIdRef = useRef({});
  const wasInitiallyVisibleRef = useRef(!covered);
  const didApplyInitialFocusRef = useRef(false);
  const pendingRef = useRef(pending);
  const coveredRef = useRef(covered);
  pendingRef.current = pending;
  coveredRef.current = covered;

  useEffect(() => {
    if (covered || !wasInitiallyVisibleRef.current || didApplyInitialFocusRef.current) return;
    didApplyInitialFocusRef.current = true;
    (initialFocus?.() ?? dialogRef.current)?.focus();
  }, [covered, initialFocus]);

  useEffect(() => () => {
    if (!coveredRef.current) returnFocusRef?.current?.focus();
  }, [returnFocusRef]);

  useEffect(() => {
    if (covered || typeof window === 'undefined') return undefined;
    if (escapeSheetWindow !== window) {
      escapeSheetStack.length = 0;
      escapeSheetWindow = window;
    }
    const sheet = sheetIdRef.current;
    escapeSheetStack.push(sheet);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (escapeSheetStack.at(-1) !== sheet) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!pendingRef.current) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const index = escapeSheetStack.lastIndexOf(sheet);
      if (index >= 0) escapeSheetStack.splice(index, 1);
    };
  }, [covered, onClose]);

  const closeIfAvailable = () => {
    if (!coveredRef.current && !pendingRef.current) onClose();
  };

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (covered || event.key !== 'Tab') return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if ((!event.shiftKey && event.target === last) || (event.shiftKey && event.target === first)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };

  return (
    <div
      className="project-folder-sheet-backdrop"
      data-testid="project-folder-sheet-backdrop"
      role="presentation"
      aria-hidden={covered || undefined}
      inert={covered || undefined}
      onClick={covered ? undefined : closeIfAvailable}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <section
        ref={dialogRef}
        className="project-folder-sheet"
        role="dialog"
        aria-modal={covered ? undefined : 'true'}
        aria-hidden={covered || undefined}
        inert={covered || undefined}
        aria-labelledby={titleId}
        aria-busy={pending || undefined}
        tabIndex={-1}
        onKeyDown={trapFocus}
        onClick={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
      >
        <span className="project-folder-sheet-handle" aria-hidden="true" />
        <header className="project-folder-sheet-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="project-folder-sheet-close" aria-label={`关闭${title}`} disabled={pending} onClick={closeIfAvailable}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="project-folder-sheet-body">{children}</div>
        <footer className="project-folder-sheet-footer">{footer}</footer>
      </section>
    </div>
  );
}

export type CreateProjectFolderSheetProps = {
  name: string;
  onNameChange: (name: string) => void;
  onCreate: (name: string) => void | Promise<void>;
  onClose: () => void;
  pending?: boolean;
  covered?: boolean;
  error?: string;
  returnFocusRef?: FocusTargetRef;
};

export function CreateProjectFolderSheet({ name, onNameChange, onCreate, onClose, pending = false, covered = false, error, returnFocusRef }: CreateProjectFolderSheetProps) {
  const requestLockRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const getInitialFocus = useCallback(() => inputRef.current, []);
  const [requestPending, setRequestPending] = useState(false);
  const effectivePending = pending || requestPending;
  const interactionLocked = effectivePending || covered;
  const normalizedName = name.trim();
  const closeIfIdle = () => {
    if (!interactionLocked && !requestLockRef.current) onClose();
  };

  const submit = async () => {
    if (!normalizedName || interactionLocked || requestLockRef.current) return;
    requestLockRef.current = true;
    setRequestPending(true);
    try {
      await onCreate(normalizedName);
    } catch {
      // The parent owns the visible request error; the sheet only releases its interaction lock.
    } finally {
      requestLockRef.current = false;
      setRequestPending(false);
    }
  };

  return (
    <ProjectFolderSheetShell
      title="新建文件夹"
      description="为作品建立一个方便查找的分类"
      pending={effectivePending}
      covered={covered}
      onClose={closeIfIdle}
      returnFocusRef={returnFocusRef}
      initialFocus={getInitialFocus}
      footer={(
        <div className="project-folder-sheet-actions">
          <button type="button" className="project-folder-sheet-secondary" aria-label="取消新建文件夹" disabled={interactionLocked} onClick={closeIfIdle}>取消</button>
          <button type="submit" form="create-project-folder-form" className="project-folder-sheet-primary" disabled={interactionLocked || !normalizedName}>{effectivePending ? '创建中…' : '创建文件夹'}</button>
        </div>
      )}
    >
      <form id="create-project-folder-form" className="project-folder-create-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label htmlFor="project-folder-name">文件夹名称</label>
        <input
          ref={inputRef}
          id="project-folder-name"
          aria-label="文件夹名称"
          maxLength={30}
          value={name}
          disabled={interactionLocked}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="例如：动物系列"
        />
        {error ? <p className="project-folder-sheet-error" role="alert">{error}</p> : null}
      </form>
    </ProjectFolderSheetShell>
  );
}

export type MoveProjectFolderSheetProps = {
  folders: ProjectFolder[];
  currentFolderId: string | null;
  selectedFolderId: string | null;
  onSelectionChange: (folderId: string | null) => void;
  onConfirm: (folderId: string | null) => void | Promise<void>;
  onCreateFolder: () => void;
  onClose: () => void;
  pending?: boolean;
  covered?: boolean;
  error?: string;
  returnFocusRef?: FocusTargetRef;
};

export function MoveProjectFolderSheet({ folders, currentFolderId, selectedFolderId, onSelectionChange, onConfirm, onCreateFolder, onClose, pending = false, covered = false, error, returnFocusRef }: MoveProjectFolderSheetProps) {
  const requestLockRef = useRef(false);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [requestPending, setRequestPending] = useState(false);
  const effectivePending = pending || requestPending;
  const interactionLocked = effectivePending || covered;
  const unchanged = selectedFolderId === currentFolderId;
  const options = [{ id: null, label: '未分类', ariaLabel: '选择未分类文件夹' }, ...folders.map((folder) => ({ id: folder.id, label: folder.name, ariaLabel: `选择文件夹${folder.name}` }))];
  const selectedOptionIndex = Math.max(0, options.findIndex((option) => option.id === selectedFolderId));
  const getInitialFocus = useCallback(() => optionRefs.current[selectedOptionIndex] ?? null, [selectedOptionIndex]);
  const closeIfIdle = () => {
    if (!interactionLocked && !requestLockRef.current) onClose();
  };

  const confirmMove = async () => {
    if (unchanged || interactionLocked || requestLockRef.current) return;
    requestLockRef.current = true;
    setRequestPending(true);
    try {
      await onConfirm(selectedFolderId);
    } catch {
      // The parent owns the visible request error; keep the sheet mounted and unlock retry.
    } finally {
      requestLockRef.current = false;
      setRequestPending(false);
    }
  };

  const option = (id: string | null, label: string, ariaLabel: string, index: number) => {
    const selected = selectedFolderId === id;
    const onOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
      if (!direction || interactionLocked) return;
      event.preventDefault();
      const nextIndex = (index + direction + options.length) % options.length;
      const nextOption = options[nextIndex];
      onSelectionChange(nextOption.id);
      optionRefs.current[nextIndex]?.focus();
    };
    return (
      <button
        key={id ?? 'uncategorized'}
        ref={(element) => { optionRefs.current[index] = element; }}
        type="button"
        className={`project-folder-option${selected ? ' is-selected' : ''}`}
        role="radio"
        aria-checked={selected}
        aria-label={ariaLabel}
        tabIndex={index === selectedOptionIndex ? 0 : -1}
        disabled={interactionLocked}
        onClick={() => { if (!interactionLocked) onSelectionChange(id); }}
        onKeyDown={onOptionKeyDown}
      >
        <span className="project-folder-radio" aria-hidden="true"><span /></span>
        <span className="project-folder-option-name">{label}</span>
        {id === currentFolderId ? <span className="project-folder-current">当前</span> : null}
      </button>
    );
  };

  return (
    <ProjectFolderSheetShell
      title="移动到文件夹"
      description="选择目标文件夹后确认移动"
      pending={effectivePending}
      covered={covered}
      onClose={closeIfIdle}
      returnFocusRef={returnFocusRef}
      initialFocus={getInitialFocus}
      footer={(
        <div className="project-folder-sheet-actions">
          <button type="button" className="project-folder-sheet-secondary" aria-label="取消移动" disabled={interactionLocked} onClick={closeIfIdle}>取消</button>
          <button type="button" className="project-folder-sheet-primary" aria-label="移动到所选文件夹" disabled={interactionLocked || unchanged} onClick={() => void confirmMove()}>{effectivePending ? '移动中…' : '移动'}</button>
        </div>
      )}
    >
      <div className="project-folder-options" role="radiogroup" aria-label="目标文件夹">
        {options.map((entry, index) => option(entry.id, entry.label, entry.ariaLabel, index))}
      </div>
      <button type="button" className="project-folder-create-option" aria-label="新建文件夹" disabled={interactionLocked} onClick={() => { if (!interactionLocked) onCreateFolder(); }}>
        <FolderPlus aria-hidden="true" />
        <span>新建文件夹</span>
      </button>
      {error ? <p className="project-folder-sheet-error" role="alert">{error}</p> : null}
    </ProjectFolderSheetShell>
  );
}
