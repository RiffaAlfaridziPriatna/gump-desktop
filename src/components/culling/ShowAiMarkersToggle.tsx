import {Pressable} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';

export const SHOW_AI_MARKERS_LABEL = 'Show AI markers';

type ShowAiMarkersToggleProps = {
  value: boolean;
  onChange: (next: boolean) => void;
};

export function ShowAiMarkersToggle({
  value,
  onChange,
}: ShowAiMarkersToggleProps) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={styles.row}
      accessibilityRole="switch"
      accessibilityLabel={SHOW_AI_MARKERS_LABEL}
      accessibilityState={{checked: value}}>
      <View style={[styles.track, value ? styles.trackOn : styles.trackOff]}>
        <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
      </View>
      <Text style={styles.label}>{SHOW_AI_MARKERS_LABEL}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
  },
  track: {
    width: 36,
    height: 20,
    borderRadius: 100,
    justifyContent: 'center',
  },
  trackOn: {backgroundColor: colors.accent},
  trackOff: {backgroundColor: colors.fabBackground},
  thumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.white,
  },
  thumbOn: {alignSelf: 'flex-end', marginRight: 2},
  thumbOff: {alignSelf: 'flex-start', marginLeft: 2},
  label: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.white,
  },
});
