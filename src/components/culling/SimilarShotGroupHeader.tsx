import {colors} from '@lib/ui/colors';
import {interSemiBoldStyle} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';
import IconLayers from '../../assets/images/lucide_layers.svg';
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
            <IconLayers
              width={HEADER_LAYERS_WIDTH}
              height={HEADER_LAYERS_HEIGHT}
              color={colors.white}
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
  title: {
    ...interSemiBoldStyle,
    color: colors.white,
    fontSize: 14,
    flexShrink: 1,
  },
});
