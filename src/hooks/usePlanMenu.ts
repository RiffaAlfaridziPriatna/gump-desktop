import {mapUserPlan} from '@application/plan/mapUserPlan';
import {useAuthState} from '@hooks/useAuth';
import {useCallback, useMemo, useState} from 'react';

export function usePlanMenu() {
  const user = useAuthState(state => state.user);
  const [isOpen, setIsOpen] = useState(false);

  const snapshot = useMemo(() => mapUserPlan(user), [user]);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen(open => !open);
  }, []);

  return {
    snapshot,
    plan: snapshot?.plan ?? null,
    isOpen,
    open,
    close,
    toggle,
  };
}
