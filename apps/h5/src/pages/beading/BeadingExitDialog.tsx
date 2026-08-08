export function BeadingExitDialog({ onSaveExit, onContinue, onAbandon }: { onSaveExit: () => void; onContinue: () => void; onAbandon?: () => void }) {
  return <div className="beading-dialog-backdrop" role="dialog" aria-modal="true" aria-label="退出拼豆"><section className="beading-dialog"><h2>保存拼豆进度？</h2><p>下次可以从当前色号继续。</p><div className="beading-dialog-actions"><button type="button" onClick={onContinue}>继续拼豆</button><button type="button" onClick={onSaveExit}>保存并退出</button>{onAbandon ? <button type="button" className="is-danger" onClick={onAbandon}>放弃会话</button> : null}</div></section></div>;
}
