export type AuthAttemptKind = 'username' | 'phone';

export type AuthAttempt = {
  id: number;
  kind: AuthAttemptKind;
  isCurrent: () => boolean;
  commitSuccess: () => boolean;
  commitError: (message: string) => boolean;
  commitFinally: () => boolean;
};

export function createAuthAttemptGuard() {
  let nextId = 0;
  let current: { id: number; kind: AuthAttemptKind } | null = null;
  const isCurrent = (id: number) => current?.id === id;
  return {
    start(kind: AuthAttemptKind): AuthAttempt {
      const id = ++nextId;
      current = { id, kind };
      return {
        id,
        kind,
        isCurrent: () => Boolean(isCurrent(id)),
        commitSuccess: () => Boolean(isCurrent(id)),
        commitError: () => Boolean(isCurrent(id)),
        commitFinally: () => Boolean(isCurrent(id)),
      };
    },
    currentKind: () => current?.kind ?? null,
    cancel: () => { current = null; },
  };
}
