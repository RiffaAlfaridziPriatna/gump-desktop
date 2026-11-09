import {colors} from '@lib/ui/colors';
import {sansBoldStyle} from '@lib/ui/typography';
import {Image, StyleSheet, Text, View} from 'react-native';
import {
  GROUP_GAP,
  HEADER_ROW_HEIGHT,
  type CulledAlbumGridSection,
} from './culledAlbumGridRows';

const ICON_LAYERS = require('../../assets/images/icon_layers.png');

type SimilarShotGroupHeaderProps = {
  section?: Pick<CulledAlbumGridSection, 'title' | 'subtitle' | 'isGroup'>;
  isFirst?: boolean;
};

export function SimilarShotGroupHeader({
  section,
  isFirst = false,
}: SimilarShotGroupHeaderProps) {
  const containerStyle = isFirst ? styles.container : styles.containerWithGap;
  if (!section) {
    return <View style={containerStyle} />;
  }
  const {title, subtitle, isGroup} = section;
  return (
    <View style={containerStyle}>
      {isGroup && (
        <View
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Image source={ICON_LAYERS} style={styles.icon} />
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
  containerWithGap: {
    height: HEADER_ROW_HEIGHT + GROUP_GAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: GROUP_GAP,
    paddingBottom: 8,
  },
  icon: {
    width: 20,
    height: 20,
  },
  title: {
    ...sansBoldStyle,
    color: colors.white,
    fontSize: 14,
  },
});
