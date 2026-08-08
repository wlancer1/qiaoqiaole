export function BeadingCompletionDialog({ onNoDeduct, onDeduct, onReturn }: { onNoDeduct: () => void; onDeduct: () => void; onReturn: () => void }) {
  return <div className="beading-dialog-backdrop" role="dialog" aria-modal="true" aria-label="完成拼豆"><section className="beading-dialog"><h2>作品已完成</h2><p>请选择库存处理方式，完成但不扣减也可以保存记录。</p><div className="beading-dialog-actions"><button type="button" onClick={onReturn}>返回检查</button><button type="button" onClick={onNoDeduct}>完成但不扣减库存</button><button type="button" className="beading-primary-btn" onClick={onDeduct}>完成并扣减库存</button></div></section></div>;
}
