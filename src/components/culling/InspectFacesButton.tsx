import {Pressable} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {StyleSheet, Text} from 'react-native';

type InspectFacesButtonProps = {
  photoId: string;
  onFocus: (photoId: string) => void;
};

// TODO(s4e): not rendered. Faces show in the panel as soon as a photo is focused,
// so this button would do nothing visible yet. Render on the focused card only
// (bottom-right of the thumbnail) once the panel needs an explicit trigger.
export function InspectFacesButton({photoId, onFocus}: InspectFacesButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Inspect faces"
      style={styles.pill}
      onPress={() => onFocus(photoId)}>
      <Text style={styles.label}>Inspect faces</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.modalOverlay,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.text,
  },
});
