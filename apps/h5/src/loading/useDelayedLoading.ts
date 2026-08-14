import { useEffect, useRef, useState } from 'react';

export function useDelayedLoading(loading: boolean, showDelayMs = 300, minimumVisibleMs = 250): boolean {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (loading) {
      if (!visible) {
        timer = setTimeout(() => {
          shownAtRef.current = Date.now();
          setVisible(true);
        }, showDelayMs);
      }
    } else if (visible) {
      const remaining = Math.max(0, minimumVisibleMs - (Date.now() - shownAtRef.current));
      timer = setTimeout(() => setVisible(false), remaining);
    } else {
      setVisible(false);
    }
    return () => clearTimeout(timer);
  }, [loading, minimumVisibleMs, showDelayMs, visible]);

  return visible;
}
