/** Shared type tag for bead and patchwork thumbnail cards. Legacy projects default to bead. */
export function WorkKindBadge({ kind }: { kind?: 'bead' | 'patchwork' }) {
  const type = kind === 'patchwork' ? 'patchwork' : 'bead';
  return <span className={`my-work-kind-badge my-work-kind-badge--${type}`}>{type === 'patchwork' ? '拼布' : '拼豆'}</span>;
}
