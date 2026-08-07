import {ProfileMenuAvatar} from '@components/navigation/ProfileMenu';
import {TouchableOpacity} from '@components/ui';
import {useProfileMenu} from '@hooks/useProfileMenu';
import {colors} from '@lib/ui/colors';
import {sansBoldStyle} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';
import IconChevronLeft from '../../assets/images/icon_chevron_left.svg';
import GumpLogo from '../../assets/images/logo.svg';

type Props = {
  onBack: () => void;
  onBackPressIn?: () => void;
  isMobileLayout: boolean;
  paddingHorizontal: number;
  profileMenu: ReturnType<typeof useProfileMenu>;
};

export function CulledAlbumDetailHeader({
  onBack,
  onBackPressIn,
  isMobileLayout,
  paddingHorizontal,
  profileMenu,
}: Props) {
  return (
    <View
      style={[
        styles.header,
        {paddingHorizontal},
        isMobileLayout && styles.headerMobile,
      ]}>
      <View style={[styles.headerLeft, isMobileLayout && styles.headerLeftMobile]}>
        <GumpLogo width={112} height={40} />
        <TouchableOpacity
          style={styles.backButton}
          onPressIn={onBackPressIn}
          onPress={onBack}
          activeOpacity={0.7}>
          <IconChevronLeft width={24} height={24} color={colors.accent} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
      <ProfileMenuAvatar menu={profileMenu} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingBottom: 24,
  },
  headerMobile: {
    paddingTop: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  headerLeftMobile: {
    gap: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    ...sansBoldStyle,
    fontSize: 20,
    color: colors.accent,
  },
});
