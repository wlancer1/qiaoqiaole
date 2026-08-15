export type AuthRouteDecision = 'wait' | 'allow' | 'login';

export function resolveAuthRoute(state: { status: 'restoring' | 'authenticated' | 'anonymous' }): AuthRouteDecision {
  if (state.status === 'restoring') return 'wait';
  return state.status === 'authenticated' ? 'allow' : 'login';
}
