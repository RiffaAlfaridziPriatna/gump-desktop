import {colors} from '@lib/ui/colors';
import {interSemiBoldStyle} from '@lib/ui/typography';
import {Image, StyleSheet, Text, View} from 'react-native';
import {
  GROUP_GAP,
  HEADER_BAR_GAP,
  HEADER_BAR_HEIGHT,
  headerRowHeight,
  type CulledAlbumGridSection,
} from './culledAlbumGridRows';

export const HEADER_ICON_SIZE = 16;
/** lucide_layers glyph size inside a 16 box (Figma inset 8.33% plus stroke). */
export const HEADER_LAYERS_WIDTH = 14.2344;
export const HEADER_LAYERS_HEIGHT = 14.2223;

const LAYERS_IMAGE = require('../../assets/images/lucide_layers_512.png');

type SimilarShotGroupHeaderProps = {
  section?: Pick<CulledAlbumGridSection, 'title' | 'subtitle' | 'isGroup'>;
  isFirst?: boolean;
};

export function SimilarShotGroupHeader({
  section,
  isFirst = false,
}: SimilarShotGroupHeaderProps) {
  const containerStyle = [
    styles.container,
    {
      height: headerRowHeight(isFirst ? 0 : 1),
      paddingTop: isFirst ? 0 : GROUP_GAP,
    },
  ];
  if (!section) {
    return <View style={containerStyle} />;
  }
  const {title, subtitle, isGroup} = section;
  return (
    <View style={containerStyle}>
      <View style={styles.bar}>
        {isGroup && (
          <View
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.icon}>
            <Image
              source={LAYERS_IMAGE}
              style={styles.layersIcon}
              resizeMode="contain"
            />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: HEADER_BAR_GAP,
  },
  bar: {
    height: HEADER_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.cardBackgroundSecondary,
  },
  icon: {
    width: HEADER_ICON_SIZE,
    height: HEADER_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layersIcon: {
    width: HEADER_LAYERS_WIDTH,
    height: HEADER_LAYERS_HEIGHT,
    tintColor: colors.white,
  },
  title: {
    ...interSemiBoldStyle,
    color: colors.white,
    fontSize: 14,
    flexShrink: 1,
  },
});
