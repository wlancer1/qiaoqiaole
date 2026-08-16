import { useLocation } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { selectUiStatusForScope, type UiStatus } from '../store/ui/uiSlice';
import { routeScopeId } from './RouteScopeBridge';

export function useRouteScopedStatus(): UiStatus | null {
  const location = useLocation();
  const scopeId = routeScopeId(location);

  return useAppSelector((state) => selectUiStatusForScope(state, scopeId));
}
