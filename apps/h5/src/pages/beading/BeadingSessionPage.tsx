import { useEffect, useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import type { Cell } from '@qiaoqiaole/core';
import { H5CanvasLayers } from '../../canvas/H5CanvasLayers';
import { CanvasRulers } from '../../canvas/H5CanvasPreview';
import { colorCodeTextColor } from '../../utils/h5AppUtils';
import { BeadingToolbar } from './BeadingToolbar';
import { BeadingColorRail } from './BeadingColorRail';
import { BeadingExitDialog } from './BeadingExitDialog';
import { BeadingCompletionDialog } from './BeadingCompletionDialog';
import type { BeadingSession } from '../../beading/beadingSessionClient';
import { completionProgress, nextIncompleteColor } from '../../beading/beadingSessionUtils';

export function BeadingSessionPage({ session, cells, rows, cols, getCode, onPatch, onPrepareCompletion, onComplete, onExit, onResume, status = '' }: { session: BeadingSession; cells: Cell[]; rows: number; cols: number; getCode: (color: string) => string; onPatch: (completedColorCodes: string[], elapsedSeconds: number) => void; onPrepareCompletion: () => void; onComplete: (deduct: boolean) => void; onExit: () => void; onResume?: () => void; status?: string }) {
  const artboardRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(session.status === 'paused' || session.status === 'pending_completion');
  const [showExit, setShowExit] = useState(false);
  const [showCompletion, setShowCompletion] = useState(session.status === 'pending_completion');
  const [elapsed, setElapsed] = useState(session.elapsedSeconds);
  const [current, setCurrent] = useState<string | null>(nextIncompleteColor(session.requirements, session.completedColorCodes));
  const progress = completionProgress(session.requirements, session.completedColorCodes);
  useEffect(() => { if (paused) return undefined; const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [paused]);
  const elapsedText = useMemo(() => `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`, [elapsed]);
  const completeCurrent = () => {
    if (!current) return;
    const next = [...new Set([...session.completedColorCodes, current])];
    onPatch(next, elapsed);
    const nextColor = nextIncompleteColor(session.requirements, next, current);
    setCurrent(nextColor);
    if (next.length === session.requirements.length) { onPrepareCompletion(); setPaused(true); setShowCompletion(true); }
  };
  const finish = (deduct: boolean) => { setShowCompletion(false); onComplete(deduct); };
  return <main className="beading-session-page" aria-label="开始拼豆"><BeadingToolbar title={session.projectName} elapsed={elapsedText} paused={paused} progress={progress} onExit={() => setShowExit(true)} onTogglePause={() => { setPaused((value) => !value); onPatch(session.completedColorCodes, elapsed); }} onSave={() => onPatch(session.completedColorCodes, elapsed)} /><section className="beading-canvas-stage"><CanvasRulers rows={rows} cols={cols} /><TransformWrapper minScale={0.25} maxScale={8} initialScale={1} centerOnInit><TransformComponent wrapperClass="beading-canvas-viewport"><div ref={artboardRef} className="beading-canvas-artboard" style={{ width: `${Math.min(82, 720 / cols * cols)}px`, aspectRatio: `${cols}/${rows}` }}><H5CanvasLayers artboardRef={artboardRef} cells={cells} rows={rows} cols={cols} codesVisible getCode={getCode} getTextColor={colorCodeTextColor} /></div></TransformComponent></TransformWrapper></section><section className="beading-tool-row" aria-label="拼豆工具"><button type="button">搜色</button><button type="button">标记</button><button type="button" className="is-active">高亮</button><button type="button">锁定</button><button type="button">更多</button><button type="button">适应</button></section><BeadingColorRail requirements={session.requirements} completed={session.completedColorCodes} current={current} onSelect={setCurrent} onCompleteColor={completeCurrent} />{status ? <p className="beading-status" role="status">{status}</p> : null}{showExit ? <BeadingExitDialog onContinue={() => setShowExit(false)} onSaveExit={() => { onPatch(session.completedColorCodes, elapsed); setShowExit(false); onExit(); }} onAbandon={onExit} /> : null}{showCompletion ? <BeadingCompletionDialog onReturn={() => { setShowCompletion(false); setPaused(true); }} onNoDeduct={() => finish(false)} onDeduct={() => finish(true)} /> : null}{onResume && paused && !showCompletion ? <button type="button" className="beading-resume-fab" onClick={() => { setPaused(false); onResume(); }}>继续计时</button> : null}</main>;
}
