import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/** Öppna/stäng uppgiftsdetaljer så att mobilens bakåtknapp fungerar naturligt */
export function useTaskNav() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const open = useCallback(
    (id: string) => setParams({ t: id }, { replace: params.has('t'), state: { openedTask: true } }),
    [params, setParams],
  );
  const close = useCallback(() => {
    if ((location.state as { openedTask?: boolean } | null)?.openedTask) navigate(-1);
    else setParams({}, { replace: true });
  }, [location.state, navigate, setParams]);
  return { taskId: params.get('t'), open, close };
}
