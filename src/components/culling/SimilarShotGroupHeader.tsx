import {colors} from '@lib/ui/colors';
import {sansBoldStyle} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';
import IconStack from '../../assets/images/icon_stack.svg';
import {HEADER_ROW_HEIGHT} from './culledAlbumGridRows';

type SimilarShotGroupHeaderProps = {
  title: string;
  subtitle?: string;
  isGroup?: boolean;
};

export function SimilarShotGroupHeader({
  title,
  subtitle,
  isGroup = false,
}: SimilarShotGroupHeaderProps) {
  return (
    <View style={styles.container}>
      {isGroup && (
        <IconStack
          width={20}
          height={20}
          color={colors.white}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      )}
      <Text accessibilityRole="header" style={styles.title}>
        {subtitle ? `${title} · ${subtitle}` : title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: HEADER_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  title: {
    ...sansBoldStyle,
    color: colors.white,
    fontSize: 14,
  },
});
