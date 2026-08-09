import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type UseBeadingElapsedTimerInput = {
  sessionId: string;
  version: number;
  authoritativeElapsed: number;
  stopped: boolean;
};

export function useBeadingElapsedTimer({
  sessionId,
  version,
  authoritativeElapsed,
  stopped,
}: UseBeadingElapsedTimerInput): number {
  const identityRef = useRef({ sessionId, version });
  const elapsedRef = useRef(authoritativeElapsed);
  const [elapsed, setElapsed] = useState(authoritativeElapsed);

  useLayoutEffect(() => {
    const identity = identityRef.current;
    if (identity.sessionId === sessionId && identity.version === version) return;
    identityRef.current = { sessionId, version };
    elapsedRef.current = authoritativeElapsed;
    setElapsed(authoritativeElapsed);
  }, [authoritativeElapsed, sessionId, version]);

  useEffect(() => {
    if (stopped) return undefined;
    const base = elapsedRef.current;
    const anchor = Date.now();
    const timer = window.setInterval(() => {
      const next = base + Math.floor((Date.now() - anchor) / 1000);
      if (next === elapsedRef.current) return;
      elapsedRef.current = next;
      setElapsed(next);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sessionId, stopped, version]);

  return elapsed;
}
