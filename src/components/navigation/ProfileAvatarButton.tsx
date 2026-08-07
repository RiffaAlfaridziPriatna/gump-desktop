import { TouchableOpacity } from '@components/ui';
import { colors } from '@lib/ui/colors';
import { Image, StyleSheet, View } from 'react-native';

const AVATAR_SIZE = 46;

type ProfileAvatarButtonProps = {
  pictureUrl: string | null;
  onPress: () => void;
  size?: number;
};

export function ProfileAvatarButton({
  pictureUrl,
  onPress,
  size = AVATAR_SIZE,
}: ProfileAvatarButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Open profile menu"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        {pictureUrl ? (
          <Image
            source={{ uri: pictureUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.link,
    overflow: 'hidden',
  },
});
