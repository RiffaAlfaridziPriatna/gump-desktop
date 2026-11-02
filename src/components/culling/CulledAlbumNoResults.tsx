import {Pressable} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';

export function ClearFiltersButton({onPress}: {onPress: () => void}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.pill}>
      <Text style={styles.pillText}>Clear filters</Text>
    </Pressable>
  );
}

export function CulledAlbumNoResults({onClear}: {onClear: () => void}) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>No photos match these filters.</Text>
      <ClearFiltersButton onPress={onClear} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12},
  message: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillText: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.accent,
  },
});
