export type SessionIdentity = { token: string; sessionVersion: number };

export function createSessionBoundOperation({ getIdentity }: { getIdentity: () => SessionIdentity }) {
  return {
    async run<T>(operation: (identity: SessionIdentity) => Promise<T>, commit: (result: T) => void, onError?: (error: unknown) => void) {
      const captured = getIdentity();
      try {
        const result = await operation(captured);
        const current = getIdentity();
        if (current.token === captured.token && current.sessionVersion === captured.sessionVersion) commit(result);
        return result;
      } catch (error) {
        const current = getIdentity();
        if (current.token === captured.token && current.sessionVersion === captured.sessionVersion) onError?.(error);
        throw error;
      }
    },
  };
}
