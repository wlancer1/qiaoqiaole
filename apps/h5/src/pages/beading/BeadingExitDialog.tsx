import { useBeadingModalFocus } from './useBeadingModalFocus';

export function BeadingExitDialog({ onSaveExit, onContinue, onAbandon, pending = false }: { onSaveExit: () => void; onContinue: () => void; onAbandon?: () => void; pending?: boolean }) {
  const focus = useBeadingModalFocus(pending, onContinue);
  return <div ref={focus.backdropRef} className="beading-dialog-backdrop" role="dialog" aria-modal="true" aria-label="退出拼豆" aria-busy={pending} onKeyDown={focus.onKeyDown}><section ref={focus.dialogRef} className="beading-dialog" tabIndex={-1}><h2>保存拼豆进度？</h2><p>下次可以从当前色号继续。</p><div className="beading-dialog-actions"><button ref={focus.initialFocusRef} type="button" disabled={pending} onClick={onContinue}>继续拼豆</button><button type="button" disabled={pending} onClick={onSaveExit}>保存并退出</button>{onAbandon ? <button type="button" className="is-danger" disabled={pending} onClick={onAbandon}>放弃会话</button> : null}</div></section></div>;
}
