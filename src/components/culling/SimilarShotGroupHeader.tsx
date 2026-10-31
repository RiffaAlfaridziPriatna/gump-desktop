import {colors} from '@lib/ui/colors';
import {sansBoldStyle} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';
import IconStack from '../../assets/images/icon_stack.svg';
import {
  HEADER_ROW_HEIGHT,
  type CulledAlbumGridSection,
} from './culledAlbumGridRows';

type SimilarShotGroupHeaderProps = {
  section?: Pick<CulledAlbumGridSection, 'title' | 'subtitle' | 'isGroup'>;
};

export function SimilarShotGroupHeader({section}: SimilarShotGroupHeaderProps) {
  if (!section) {
    return <View style={styles.container} />;
  }
  const {title, subtitle, isGroup} = section;
  return (
    <View style={styles.container}>
      {isGroup && (
        <View
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <IconStack width={20} height={20} color={colors.white} />
        </View>
      )}
      <Text
        accessibilityRole="header"
        accessibilityLabel={
          subtitle ? `${title}, ${subtitle.replace(/ · /g, ', ')}` : title
        }
        numberOfLines={1}
        style={styles.title}>
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
