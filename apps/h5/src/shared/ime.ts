const composingTargets = new WeakSet<EventTarget>();

/** Track the target as well: some Safari IME key events omit isComposing. */
export function setImeComposition(target: EventTarget, composing: boolean) {
  if (composing) composingTargets.add(target);
  else composingTargets.delete(target);
}

export function isImeComposing(event: { isComposing?: boolean; keyCode?: number; target?: EventTarget | null } | undefined): boolean {
  return Boolean(event && (event.isComposing || event.keyCode === 229 || (event.target && composingTargets.has(event.target))));
}
