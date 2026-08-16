import { useEffect } from 'react';

let lockCount = 0;
let previousOverflow = '';

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined' || !document.body?.style) return undefined;
    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) document.body.style.overflow = previousOverflow;
    };
  }, [locked]);
}
