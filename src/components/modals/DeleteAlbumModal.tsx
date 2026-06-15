import {Modal} from '@components/ui';
import {colors} from '@lib/colors';
import {make} from '@lib/di';
import {fonts} from '@lib/typography';
import {APIService, APIResponse} from '@services/api';
import {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import DecorativeDeleteAlbum from '../../assets/images/modal_decorative_delete_album.svg';

type DeleteAlbumModalProps = {
  visible: boolean;
  album: APIResponse.CulledAlbum | null;
  onClose: () => void;
  onDeleted: () => void;
};

export function DeleteAlbumModal({
  visible,
  album,
  onClose,
  onDeleted,
}: DeleteAlbumModalProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!album || deleting) return;
    setDeleting(true);
    try {
      await make(APIService).culledAlbum.delete(album.id);
      onDeleted();
      onClose();
    } catch (error) {
      console.error('[DeleteAlbumModal] Failed to delete album', error);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      width={600}
      height={460}
      decorative={DecorativeDeleteAlbum}
      decorativeHeight={140}>
      <View style={styles.content}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Delete Album?</Text>
          <Text style={styles.message}>Are you sure you want to delete this album?</Text>
        </View>
        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            disabled={deleting}
            activeOpacity={0.8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={deleting}
            activeOpacity={0.8}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  titleContainer: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 28,
    letterSpacing: 0,
    color: colors.textDark,
    textAlign: 'center',
    fontWeight: '700',
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 16,
    color: colors.textDark,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 32,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.white,
  },
  deleteButton: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.error,
    paddingVertical: 8,
    paddingHorizontal: 32,
    backgroundColor: 'transparent',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.error,
  },
});
