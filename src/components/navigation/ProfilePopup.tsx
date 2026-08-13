import { Pressable, TouchableOpacity } from '@components/ui';
import { colors } from '@lib/ui/colors';
import { fonts } from '@lib/ui/typography';
import { Image, StyleSheet, Text, View } from 'react-native';
import DecorativeDeleteAlbum from '../../assets/images/modal_decorative_delete_album.svg';

const POPUP_AVATAR_SIZE = 70;

type ProfilePopupProps = {
  userName: string;
  pictureUrl: string | null;
  onUpgrade: () => void;
  onLogout: () => void;
  onDismiss: () => void;
  topOffset?: number;
  rightOffset?: number;
};

export function ProfilePopup({
  userName,
  pictureUrl,
  onUpgrade,
  onLogout,
  onDismiss,
  topOffset = 96,
  rightOffset = 48,
}: ProfilePopupProps) {
  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable style={styles.overlay} onPress={onDismiss} />
      <View style={[styles.card, { top: topOffset, right: rightOffset }]}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            {pictureUrl ? (
              <Image source={{ uri: pictureUrl }} style={styles.avatarImage} />
            ) : null}
          </View>
          <Text style={styles.userName} numberOfLines={2}>
            {userName}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.menu}>
          {/* <TouchableOpacity
            onPress={onUpgrade}
            activeOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Text style={styles.menuItem}>Upgrade My Plan</Text>
          </TouchableOpacity> */}
          <TouchableOpacity
            onPress={onLogout}
            activeOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Text style={styles.menuItem}>Log Out</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.decorative}>
          <DecorativeDeleteAlbum
            width="100%"
            height={60}
            preserveAspectRatio="xMidYMax slice"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    position: 'absolute',
    width: 280,
    backgroundColor: colors.cardBackground,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 16,
  },
  avatar: {
    width: POPUP_AVATAR_SIZE,
    height: POPUP_AVATAR_SIZE,
    borderRadius: POPUP_AVATAR_SIZE / 2,
    backgroundColor: colors.link,
    overflow: 'hidden',
  },
  avatarImage: {
    width: POPUP_AVATAR_SIZE,
    height: POPUP_AVATAR_SIZE,
    borderRadius: POPUP_AVATAR_SIZE / 2,
  },
  userName: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 16 * 1.2,
    color: colors.textDark,
  },
  divider: {
    height: 1,
    backgroundColor: colors.dividerLight,
  },
  menu: {
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 32,
    gap: 32,
  },
  menuItem: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 16 * 1.3,
    color: colors.textDark,
  },
  decorative: {
    height: 60,
    marginTop: 12,
  },
});
