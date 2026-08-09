import { useBeadingModalFocus } from './useBeadingModalFocus';

export function BeadingCompletionDialog({ onNoDeduct, onDeduct, onReturn, pending = false }: { onNoDeduct: () => void; onDeduct: () => void; onReturn: () => void; pending?: boolean }) {
  const focus = useBeadingModalFocus(pending, onReturn);
  return <div ref={focus.backdropRef} className="beading-dialog-backdrop" role="dialog" aria-modal="true" aria-label="完成拼豆" aria-busy={pending} onKeyDown={focus.onKeyDown}><section ref={focus.dialogRef} className="beading-dialog" tabIndex={-1}><h2>作品已完成</h2><p>请选择库存处理方式，完成但不扣减也可以保存记录。</p><div className="beading-dialog-actions"><button ref={focus.initialFocusRef} type="button" disabled={pending} onClick={onReturn}>返回检查</button><button type="button" disabled={pending} onClick={onNoDeduct}>完成但不扣减库存</button><button type="button" className="beading-primary-btn" disabled={pending} onClick={onDeduct}>完成并扣减库存</button></div></section></div>;
}
