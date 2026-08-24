import {useAuthActions, useAuthState} from '@hooks/useAuth';
import {openUpgradePlan} from '@lib/plan/billingLinks';
import {APIResponse} from '@services/api';
import {useCallback, useMemo, useState} from 'react';

export function resolveProfilePictureUrl(
  user: APIResponse.User | APIResponse.Guest | null,
): string | null {
  if (!user || user.role === 'guest' || !('details' in user) || !user.details) {
    return null;
  }

  const preview = user.details.picture?.preview;
  return (
    preview?.thumbnail?.url ??
    preview?.small?.url ??
    preview?.medium?.url ??
    null
  );
}

export function useProfileMenu() {
  const user = useAuthState(state => state.user);
  const {logout} = useAuthActions();
  const [isOpen, setIsOpen] = useState(false);

  const pictureUrl = useMemo(() => resolveProfilePictureUrl(user), [user]);
  const userName = user?.name ?? '';

  const toggle = useCallback(() => {
    setIsOpen(open => !open);
  }, []);

  const dismiss = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleUpgrade = useCallback(() => {
    setIsOpen(false);
    void openUpgradePlan().catch(error => {
      console.error('[useProfileMenu] Failed to open upgrade', error);
    });
  }, []);

  const handleLogout = useCallback(async () => {
    setIsOpen(false);
    await logout();
  }, [logout]);

  return {
    isOpen,
    pictureUrl,
    userName,
    toggle,
    dismiss,
    handleUpgrade,
    handleLogout,
  };
}
