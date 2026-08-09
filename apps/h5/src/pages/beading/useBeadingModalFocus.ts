import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

type FocusTarget = HTMLElement & { inert?: boolean };

export type UseBeadingModalFocusResult = {
  backdropRef: RefObject<HTMLDivElement | null>;
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLButtonElement | null>;
  onKeyDown: (event: KeyboardEvent) => void;
};

export function useBeadingModalFocus(
  pending: boolean,
  onEscape: () => void,
): UseBeadingModalFocusResult {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previousFocus = document.activeElement as FocusTarget | null;
    const backdrop = backdropRef.current;
    const parent = backdrop?.parentElement;
    const siblingStates = parent
      ? Array.from(parent.children)
        .filter((element) => element !== backdrop)
        .map((element) => {
          const target = element as FocusTarget;
          const state = {
            target,
            inert: Boolean(target.inert),
            ariaHidden: target.getAttribute('aria-hidden'),
          };
          target.inert = true;
          target.setAttribute('aria-hidden', 'true');
          return state;
        })
      : [];
    (initialFocusRef.current ?? dialogRef.current)?.focus();
    return () => {
      siblingStates.forEach(({ target, inert, ariaHidden }) => {
        target.inert = inert;
        if (ariaHidden === null) target.removeAttribute('aria-hidden');
        else target.setAttribute('aria-hidden', ariaHidden);
      });
      previousFocus?.focus?.();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (!pending) escapeRef.current();
      event.preventDefault();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { backdropRef, dialogRef, initialFocusRef, onKeyDown };
}
