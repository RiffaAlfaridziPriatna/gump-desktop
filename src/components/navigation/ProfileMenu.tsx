import {ProfileAvatarButton} from '@components/navigation/ProfileAvatarButton';
import {ProfilePopup} from '@components/navigation/ProfilePopup';
import {useProfileMenu} from '@hooks/useProfileMenu';

type ProfileMenuControls = ReturnType<typeof useProfileMenu>;

type ProfileMenuAvatarProps = {
  menu: ProfileMenuControls;
};

export function ProfileMenuAvatar({menu}: ProfileMenuAvatarProps) {
  return (
    <ProfileAvatarButton
      pictureUrl={menu.pictureUrl}
      onPress={menu.toggle}
    />
  );
}

type ProfileMenuPopupProps = {
  menu: ProfileMenuControls;
  topOffset?: number;
  rightOffset?: number;
};

export function ProfileMenuPopup({
  menu,
  topOffset,
  rightOffset,
}: ProfileMenuPopupProps) {
  if (!menu.isOpen) {
    return null;
  }

  return (
    <ProfilePopup
      userName={menu.userName}
      pictureUrl={menu.pictureUrl}
      onUpgrade={menu.handleUpgrade}
      onLogout={menu.handleLogout}
      onDismiss={menu.dismiss}
      topOffset={topOffset}
      rightOffset={rightOffset}
    />
  );
}
