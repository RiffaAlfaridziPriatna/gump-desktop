import {Modal} from '@components/ui';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';

type UploadSelectedConfirmModalProps = {
  visible: boolean;
  photoCount: number;
  albumName: string;
  onClose: () => void;
  onStartUpload: () => Promise<void>;
};

export function UploadSelectedConfirmModal({
  visible,
  photoCount,
  albumName,
  onClose,
  onStartUpload,
}: UploadSelectedConfirmModalProps) {
  const [starting, setStarting] = useState(false);

  async function handleStartUpload() {
    if (starting) {
      return;
    }
    setStarting(true);
    try {
      await onStartUpload();
    } catch (error) {
      console.error('[UploadSelectedConfirmModal] Failed to start upload', error);
    } finally {
      setStarting(false);
    }
  }

  return (
    <Modal visible={visible} onClose={onClose} width={720} height={400}>
      <View style={styles.content}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Upload Photos ({photoCount})</Text>
          <Text style={styles.message}>
            You&apos;re uploading photos to <Text style={styles.albumName}>{albumName}</Text> album.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.startButton, starting && styles.startButtonDisabled]}
          onPress={handleStartUpload}
          disabled={starting}
          activeOpacity={0.8}>
          <Text style={styles.startButtonText}>
            {starting ? 'Starting...' : 'Start Upload'}
          </Text>
        </TouchableOpacity>
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
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 28 * 1.2,
    letterSpacing: 0,
    color: colors.textDark,
    textAlign: 'center',
    fontWeight: '700',
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 16 * 1.4,
    color: colors.textDark,
    textAlign: 'center',
  },
  albumName: {
    fontFamily: fonts.sansBold,
  },
  startButton: {
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 40,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonDisabled: {
    opacity: 0.7,
  },
  startButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.white,
  },
});
