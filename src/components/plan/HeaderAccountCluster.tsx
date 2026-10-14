import {ProfileMenuAvatar} from '@components/navigation/ProfileMenu';
import {useProfileMenu} from '@hooks/useProfileMenu';
import {StyleSheet, View} from 'react-native';

type HeaderAccountClusterProps = {
  profileMenu: ReturnType<typeof useProfileMenu>;
};

/** Header account controls. Plan button / Your Plan modal are disabled for now. */
export function HeaderAccountCluster({
  profileMenu,
}: HeaderAccountClusterProps) {
  return (
    <View style={styles.cluster}>
      <ProfileMenuAvatar menu={profileMenu} />
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
