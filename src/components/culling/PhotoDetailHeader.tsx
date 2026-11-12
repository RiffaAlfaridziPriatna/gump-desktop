import {Pressable} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {interSemiBoldStyle, sansSemiBoldStyle} from '@lib/ui/typography';
import {Image, StyleSheet, Text, View} from 'react-native';
import IconClose from '../../assets/images/icon_close.svg';
import IconStar from '../../assets/images/icon_star.svg';
import IconStarOutlined from '../../assets/images/icon_star_outlined.svg';

export const PICK_LABEL = 'Pick for upload';
export const PICKED_LABEL = 'Picked';
const PICK_CHECK_IMAGE = require('../../assets/images/icon_pick_check_512.png');
const PICK_CHECK_SIZE = 13;

type PhotoDetailHeaderProps = {
  fileName: string;
  starRating: number;
  picked: boolean;
  disabled: boolean;
  isMobileLayout: boolean;
  paddingHorizontal: number;
  onRate: (starIndex: number) => void;
  onTogglePick: () => void;
  onClose: () => void;
};

export function PhotoDetailHeader({
  fileName,
  starRating,
  picked,
  disabled,
  isMobileLayout,
  paddingHorizontal,
  onRate,
  onTogglePick,
  onClose,
}: PhotoDetailHeaderProps) {
  return (
    <View
      style={[
        styles.header,
        {paddingHorizontal},
        isMobileLayout && styles.headerMobile,
      ]}>
      <View style={[styles.left, isMobileLayout && styles.leftMobile]}>
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName}
        </Text>

        <View style={styles.info}>
          <View style={styles.stars}>
            {[...Array(5)].map((_, index) => {
              const Icon = starRating > index ? IconStar : IconStarOutlined;

              return (
                <Pressable
                  key={index}
                  onPress={() => onRate(index)}
                  style={[styles.control, disabled && styles.disabled]}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${index + 1} stars`}>
                  <Icon width={24} height={24} color={colors.accent} />
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onTogglePick}
            style={[
              styles.pick,
              picked ? styles.pickPicked : styles.pickIdle,
              disabled && styles.disabled,
            ]}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={picked ? PICKED_LABEL : PICK_LABEL}
            accessibilityState={{selected: picked, disabled}}>
            <View style={[styles.circle, picked && styles.circlePicked]}>
              {picked ? (
                <Image
                  source={PICK_CHECK_IMAGE}
                  style={styles.pickCheck}
                  resizeMode="contain"
                />
              ) : null}
            </View>
            <Text style={styles.pickLabel}>
              {picked ? PICKED_LABEL : PICK_LABEL}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={onClose}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Close photo detail">
        <IconClose width={32} height={32} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 40,
    gap: 16,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingTop: 16,
    gap: 12,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    minWidth: 0,
  },
  leftMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
  },
  fileName: {
    ...sansSemiBoldStyle,
    flexShrink: 1,
    fontSize: 20,
    color: colors.text,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12.654,
  },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  control: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  // Figma 12975:54676 — unpicked: 1px #4A4A4A ring, no fill.
  pickIdle: {
    borderWidth: 1,
    borderColor: '#4A4A4A',
  },
  // Figma 12975:55711 — picked: fill #242424, no ring.
  pickPicked: {
    backgroundColor: '#242424',
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circlePicked: {backgroundColor: colors.accent, borderWidth: 0},
  pickCheck: {
    width: PICK_CHECK_SIZE,
    height: PICK_CHECK_SIZE,
    tintColor: colors.white,
  },
  pickLabel: {
    ...interSemiBoldStyle,
    fontSize: 14,
    color: colors.white,
  },
  disabled: {
    opacity: 0.5,
  },
  close: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
