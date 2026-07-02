import {TouchableOpacity} from '@components/ui';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {StyleSheet, Text, View} from 'react-native';
import IconChevronLeft from '../../assets/images/icon_chevron_left.svg';
import GumpLogo from '../../assets/images/logo.svg';

type Props = {
  onBack: () => void;
  isMobileLayout: boolean;
  paddingHorizontal: number;
};

export function CulledAlbumDetailHeader({
  onBack,
  isMobileLayout,
  paddingHorizontal,
}: Props) {
  return (
    <View
      style={[
        styles.header,
        {paddingHorizontal},
        isMobileLayout && styles.headerMobile,
      ]}>
      <GumpLogo width={112} height={40} />
      <TouchableOpacity
        style={styles.backButton}
        onPress={onBack}
        activeOpacity={0.7}>
        <IconChevronLeft width={24} height={24} color={colors.accent} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 24,
    gap: 24,
  },
  headerMobile: {
    paddingTop: 16,
    gap: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontFamily: fonts.sansBold,
    fontSize: 20,
    color: colors.accent,
  },
});
