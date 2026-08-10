import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { Cell } from '@qiaoqiaole/core';
import { BeadingCanvasLayers } from '../../canvas/BeadingCanvasLayers';
import { CanvasRulers } from '../../canvas/H5CanvasPreview';
import { colorCodeTextColor } from '../../utils/h5AppUtils';
import {
  beadingToolReducer,
  createBeadingToolState,
  reviseMarkedCell,
  sortBeadingRequirements,
  toggleMarkedCell,
  type SortMode,
} from '../../beading/beadingToolState';
import { useBeadingDraft } from '../../beading/useBeadingDraft';
import type { BeadingSession } from '../../beading/beadingSessionClient';
import { completionProgress, nextIncompleteColor } from '../../beading/beadingSessionUtils';
import { BeadingToolbar } from './BeadingToolbar';
import { BeadingColorRail } from './BeadingColorRail';
import { BeadingToolRow } from './BeadingToolRow';
import { BeadingToolPanels } from './BeadingToolPanels';
import { BeadingCanvasViewport } from './BeadingCanvasViewport';
import { BeadingExitDialog } from './BeadingExitDialog';
import { BeadingCompletionDialog } from './BeadingCompletionDialog';
import { useBeadingPointer } from './useBeadingPointer';
import {
  useBeadingSessionActions,
  type Complete,
  type Prepare,
  type Resume,
  type SessionMutation,
  type SessionTransition,
} from './useBeadingSessionActions';
import { useBeadingElapsedTimer } from './useBeadingElapsedTimer';
import type { ReactNode } from 'react';
import './beadingSession.css';

export type BeadingSessionPageProps = {
  session: BeadingSession;
  cells: Cell[];
  rows: number;
  cols: number;
  getCode: (color: string) => string;
  onPatch: SessionMutation;
  onPause: SessionMutation;
  onReturnToProgress: SessionTransition;
  onAbandon: SessionTransition;
  onPrepareCompletion: Prepare;
  onComplete: Complete;
  onResume: Resume;
  onOpenInventory: () => Promise<void>;
  onExit: (input: { mode: 'saved' | 'abandon' | 'completed' }) => void;
  onSessionConflict: (session: BeadingSession) => void;
  draftOwnerId?: string;
  legacyDraftOwnerId?: string;
  onStatus: (message: string) => void;
  requestConfirm?: (request: { title: string; message: string; confirmText?: string; danger?: boolean; onConfirm: () => void | Promise<void> }) => void;
  confirmDialog?: ReactNode;
  status?: string;
};

const sortCycle: Record<SortMode, SortMode> = {
  canvas: 'remaining',
  remaining: 'code',
  code: 'remaining',
};

function pausedFromSession(session: BeadingSession): boolean {
  return session.status === 'paused' || session.status === 'pending_completion';
}

function isTerminalStatus(status: string): boolean {
  return status === 'pending_completion' || status.startsWith('completed');
}

export function BeadingSessionPage({
  session,
  cells,
  rows,
  cols,
  getCode,
  onPatch,
  onPause,
  onReturnToProgress,
  onAbandon,
  onPrepareCompletion,
  onComplete,
  onResume,
  onOpenInventory,
  onExit,
  onSessionConflict,
  draftOwnerId,
  legacyDraftOwnerId,
  onStatus,
  requestConfirm,
  confirmDialog,
  status = '',
}: BeadingSessionPageProps) {
  const artboardRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<() => void>(() => undefined);
  const lastSyncedSessionIdRef = useRef(session.id);
  const lastSyncedVersionRef = useRef(session.version);
  const lastSyncedCompletedCodesRef = useRef(session.completedColorCodes);
  const [toolState, dispatch] = useReducer(beadingToolReducer, undefined, createBeadingToolState);
  const [searchQuery, setSearchQuery] = useState('');
  const [paused, setPaused] = useState(() => pausedFromSession(session));
  const [pauseRequested, setPauseRequested] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [showCompletion, setShowCompletion] = useState(session.status === 'pending_completion');
  const [current, setCurrent] = useState<string | null>(() => (
    nextIncompleteColor(session.requirements, session.completedColorCodes)
  ));
  const cellCount = Math.max(0, rows * cols);
  const askForConfirmation = requestConfirm ?? ((request: { onConfirm: () => void | Promise<void> }) => { void request.onConfirm(); });
  const progress = completionProgress(session.requirements, session.completedColorCodes);

  const { clearDraft } = useBeadingDraft({
    ownerId: draftOwnerId,
    legacyOwnerId: legacyDraftOwnerId,
    sessionId: session.id,
    cellCount,
    state: toolState,
    dispatch,
    onWarning: onStatus,
  });

  const elapsed = useBeadingElapsedTimer({
    sessionId: session.id,
    version: session.version,
    authoritativeElapsed: session.elapsedSeconds,
    stopped: paused || pauseRequested,
  });

  const actions = useBeadingSessionActions({
    session,
    elapsedSeconds: elapsed,
    currentColor: current,
    onPatch,
    onPause,
    onReturnToProgress,
    onAbandon,
    onPrepareCompletion,
    onComplete,
    onResume,
    onOpenInventory,
    onSessionConflict,
    onStatus,
    onCurrentChange: setCurrent,
    onPrepared: () => {
      setPaused(true);
      setShowCompletion(true);
    },
    onCompleted: () => {
      clearDraft();
      onExit({ mode: 'completed' });
    },
  });

  useLayoutEffect(() => {
    if (lastSyncedSessionIdRef.current !== session.id) {
      lastSyncedSessionIdRef.current = session.id;
      lastSyncedVersionRef.current = session.version;
      lastSyncedCompletedCodesRef.current = session.completedColorCodes;
      dispatch({ type: 'reset' });
      setPaused(pausedFromSession(session));
      setPauseRequested(false);
      setCurrent(nextIncompleteColor(session.requirements, session.completedColorCodes));
      setSearchQuery('');
      setShowExit(false);
      setShowCompletion(session.status === 'pending_completion');
      return;
    }
    if (lastSyncedVersionRef.current === session.version) return;
    lastSyncedVersionRef.current = session.version;
    const previousCompletedCodes = lastSyncedCompletedCodesRef.current;
    lastSyncedCompletedCodesRef.current = session.completedColorCodes;
    setPaused(pausedFromSession(session));
    setPauseRequested(false);
    setCurrent((selected) => {
      if (selected
        && !previousCompletedCodes.includes(selected)
        && session.completedColorCodes.includes(selected)) {
        return nextIncompleteColor(session.requirements, session.completedColorCodes);
      }
      if (selected && session.requirements.some(({ colorCode }) => colorCode === selected)) return selected;
      return nextIncompleteColor(session.requirements, session.completedColorCodes);
    });
  }, [session.id, session.version, session.elapsedSeconds, session.status, session.requirements, session.completedColorCodes]);

  useEffect(() => {
    setCurrent((selected) => {
      if (selected && session.requirements.some(({ colorCode }) => colorCode === selected)) return selected;
      return nextIncompleteColor(session.requirements, session.completedColorCodes);
    });
  }, [session.requirements, session.completedColorCodes]);

  useEffect(() => {
    dispatch({ type: 'set-marks', indexes: toolState.markedCellIndexes, cellCount });
  }, [cellCount]);

  const elapsedText = useMemo(
    () => `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`,
    [elapsed],
  );

  const colorByCode = useMemo(() => {
    const result = new Map<string, string>();
    cells.forEach((cell) => {
      if (!cell.transparent) {
        const code = getCode(cell.color);
        if (!result.has(code)) result.set(code, cell.color);
      }
    });
    return result;
  }, [cells, getCode]);
  const resolveColor = useCallback((colorCode: string) => colorByCode.get(colorCode) ?? '#eef2f7', [colorByCode]);

  const sortedRequirements = useMemo(() => sortBeadingRequirements(
    session.requirements,
    cells,
    getCode,
    session.completedColorCodes,
    toolState.sortMode,
  ), [cells, getCode, session.completedColorCodes, session.requirements, toolState.sortMode]);

  const selectColor = useCallback((colorCode: string) => {
    setCurrent(colorCode);
    if (!toolState.highlightEnabled) dispatch({ type: 'toggle-highlight' });
  }, [toolState.highlightEnabled]);

  const onCell = useCallback((index: number) => {
    const cell = cells[index];
    if (toolState.locked || !current || !cell || cell.transparent || getCode(cell.color) !== current) return;
    const indexes = toolState.interactionMode === 'mark'
      ? toggleMarkedCell(toolState.markedCellIndexes, index, cellCount)
      : reviseMarkedCell(toolState.markedCellIndexes, index, cellCount);
    dispatch({ type: 'set-marks', indexes, cellCount });
  }, [cellCount, cells, current, getCode, toolState.interactionMode, toolState.locked, toolState.markedCellIndexes]);

  const pointerHandlers = useBeadingPointer({
    artboardRef,
    rows,
    cols,
    locked: toolState.locked,
    interactionMode: toolState.interactionMode,
    onCell,
  });

  const allCompleted = nextIncompleteColor(session.requirements, session.completedColorCodes) === null;
  const terminalPrepare = allCompleted && !isTerminalStatus(session.status);
  const hasPendingAction = actions.pendingAction !== null;
  const toolbarPendingAction = actions.pendingAction === 'pause'
    ? 'resume'
    : actions.pendingAction === 'return' || actions.pendingAction === 'abandon'
      ? null
      : actions.pendingAction;
  const canvasOverlay = useMemo(() => ({
    currentColorCode: current,
    highlightEnabled: toolState.highlightEnabled,
    markedCellIndexes: toolState.markedCellIndexes,
    completedColorCodes: session.completedColorCodes,
  }), [current, session.completedColorCodes, toolState.highlightEnabled, toolState.markedCellIndexes]);

  const togglePause = useCallback(async () => {
    if (!paused) {
      setPauseRequested(true);
      const succeeded = await actions.pause();
      if (succeeded) setPaused(true);
      setPauseRequested(false);
      return;
    }
    if (await actions.resume()) setPaused(false);
  }, [actions, paused]);

  const saveAndExit = useCallback(async () => {
    if (!await actions.save()) return;
    setShowExit(false);
    onExit({ mode: 'saved' });
  }, [actions, onExit]);

  const abandon = useCallback(async () => {
    if (!await actions.abandon()) return;
    clearDraft();
    setShowExit(false);
    onExit({ mode: 'abandon' });
  }, [actions, clearDraft, onExit]);

  const returnToProgress = useCallback(async () => {
    if (!await actions.returnToProgress()) return;
    setShowCompletion(false);
    setPaused(true);
  }, [actions]);

  const finish = useCallback(async (deduct: boolean) => {
    if (await actions.complete(deduct)) setShowCompletion(false);
  }, [actions]);

  const mainClassName = `beading-session-page${toolState.focusMode ? ' is-focus' : ''}`;
  return (
    <main className={mainClassName} aria-label="开始拼豆">
      <BeadingToolbar
        elapsed={elapsedText}
        paused={paused}
        progress={progress}
        pendingAction={toolbarPendingAction}
        focusMode={toolState.focusMode}
        onExit={() => setShowExit(true)}
        onInventory={() => { void actions.openInventory(); }}
        onTogglePause={() => { void togglePause(); }}
        onSave={() => { void actions.save(); }}
        onSettings={() => dispatch({ type: 'set-panel', panel: 'more' })}
      />
      <BeadingCanvasViewport
        rows={rows}
        cols={cols}
        locked={toolState.locked}
        focusMode={toolState.focusMode}
        interactionMode={toolState.interactionMode}
        artboardRef={artboardRef}
        artboardProps={pointerHandlers}
        onFitReady={(fit) => { fitRef.current = fit; }}
      >
        <CanvasRulers rows={rows} cols={cols} />
        <BeadingCanvasLayers
          artboardRef={artboardRef}
          cells={cells}
          rows={rows}
          cols={cols}
          codesVisible={toolState.codesVisible}
          gridVisible={toolState.gridVisible}
          getCode={getCode}
          getTextColor={colorCodeTextColor}
          overlay={canvasOverlay}
        />
      </BeadingCanvasViewport>
      {!toolState.focusMode ? <>
        <BeadingToolRow
          interactionMode={toolState.interactionMode}
          activePanel={toolState.activePanel}
          highlightEnabled={toolState.highlightEnabled}
          locked={toolState.locked}
          currentColor={current}
          pending={hasPendingAction}
          onSearch={() => dispatch({ type: 'set-panel', panel: toolState.activePanel === 'search' ? null : 'search' })}
          onToggleMark={() => dispatch({ type: 'toggle-mode', mode: 'mark' })}
          onToggleHighlight={() => dispatch({ type: 'toggle-highlight' })}
          onToggleLock={() => dispatch({ type: 'toggle-lock' })}
          onMore={() => dispatch({ type: 'set-panel', panel: toolState.activePanel === 'more' ? null : 'more' })}
          onFit={() => fitRef.current()}
        />
        <BeadingColorRail
          requirements={sortedRequirements}
          completed={session.completedColorCodes}
          current={current}
          sortMode={toolState.sortMode}
          resolveColor={resolveColor}
          resolveTextColor={colorCodeTextColor}
          pending={hasPendingAction}
          terminalPrepare={terminalPrepare}
          revisionActive={toolState.interactionMode === 'revise'}
          onSelect={selectColor}
          onSort={() => dispatch({ type: 'set-sort', sortMode: sortCycle[toolState.sortMode] })}
          onRevise={() => dispatch({ type: 'toggle-mode', mode: 'revise' })}
          onComplete={() => { void (terminalPrepare ? actions.retryPrepare() : actions.completeCurrent()); }}
        />
      </> : null}
      {status ? <p className="beading-status" role="status">{status}</p> : null}
      <BeadingToolPanels
        {...(toolState.activePanel === 'search' ? {
          activePanel: 'search' as const,
          query: searchQuery,
          onQueryChange: setSearchQuery,
          requirements: sortedRequirements,
          completed: session.completedColorCodes,
          current,
          resolveColor,
          onSelect: selectColor,
          onClose: () => dispatch({ type: 'set-panel', panel: null }),
        } : toolState.activePanel === 'more' ? {
          activePanel: 'more' as const,
          codesVisible: toolState.codesVisible,
          gridVisible: toolState.gridVisible,
          hasMarks: toolState.markedCellIndexes.length > 0,
          onToggleCodes: () => dispatch({ type: 'toggle-codes' }),
          onToggleGrid: () => dispatch({ type: 'toggle-grid' }),
          onClearMarks: () => {
            askForConfirmation({ title: '清除单格标记？', message: '将清除当前拼豆页面中的全部单格标记。', confirmText: '清除标记', danger: true, onConfirm: () => dispatch({ type: 'set-marks', indexes: [], cellCount }) });
          },
          onReset: () => {
            askForConfirmation({ title: '恢复默认设置？', message: '将恢复工具栏、网格和色号显示的默认设置。', confirmText: '恢复默认', onConfirm: () => dispatch({ type: 'reset' }) });
          },
          onClose: () => dispatch({ type: 'set-panel', panel: null }),
        } : { activePanel: null as null })}
      />
      {showExit ? <BeadingExitDialog
        pending={actions.pendingAction === 'save' || actions.pendingAction === 'abandon'}
        onContinue={() => setShowExit(false)}
        onSaveExit={() => { void saveAndExit(); }}
        onAbandon={() => { void abandon(); }}
      /> : null}
      {showCompletion ? <BeadingCompletionDialog
        pending={actions.pendingAction === 'complete' || actions.pendingAction === 'return'}
        onReturn={() => { void returnToProgress(); }}
        onNoDeduct={() => { void finish(false); }}
        onDeduct={() => { void finish(true); }}
      /> : null}
      {confirmDialog}
    </main>
  );
}
