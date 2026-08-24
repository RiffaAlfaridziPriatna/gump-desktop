import {HeaderPlanButton} from '@components/plan/HeaderPlanButton';
import {YourPlanModal} from '@components/plan/YourPlanModal';
import {ProfileMenuAvatar} from '@components/navigation/ProfileMenu';
import {usePlanMenu} from '@hooks/usePlanMenu';
import {useProfileMenu} from '@hooks/useProfileMenu';
import {StyleSheet, View} from 'react-native';

type HeaderAccountClusterProps = {
  profileMenu: ReturnType<typeof useProfileMenu>;
  planMenu: ReturnType<typeof usePlanMenu>;
};

export function HeaderAccountCluster({
  profileMenu,
  planMenu,
}: HeaderAccountClusterProps) {
  return (
    <View style={styles.cluster}>
      {planMenu.plan ? (
        <HeaderPlanButton
          planName={planMenu.plan.displayName}
          onPress={planMenu.open}
        />
      ) : null}
      <ProfileMenuAvatar menu={profileMenu} />
    </View>
  );
}

type HeaderPlanModalProps = {
  planMenu: ReturnType<typeof usePlanMenu>;
};

export function HeaderPlanModal({planMenu}: HeaderPlanModalProps) {
  if (!planMenu.snapshot) {
    return null;
  }

  return (
    <YourPlanModal
      visible={planMenu.isOpen}
      snapshot={planMenu.snapshot}
      onClose={planMenu.close}
    />
  );
}

const styles = StyleSheet.create({
  cluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
