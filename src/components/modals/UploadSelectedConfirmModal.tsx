import {Modal} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {useState} from 'react';
import {TouchableOpacity} from '@components/ui';
import {StyleSheet, Text, View} from 'react-native';
import HalfCircle from "../../assets/images/upload/half_circle.svg"
import QuarterCircleOrange from "../../assets/images/upload/orange_quarter_circle.svg"
import QuarterCircleRed from "../../assets/images/upload/red_quarter_circle.svg"
import CircleBlue from "../../assets/images/upload/blue_circle.svg"
import CircleLightBlue from "../../assets/images/upload/light_blue_circle.svg"

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
      <HalfCircle style={styles.halfCircleDecor} width={72} />
      <QuarterCircleOrange style={styles.quarterOrangeDecor} width={98} height={98} />
      <QuarterCircleRed style={styles.quarterRedDecor} width={80} height={80} />
      <CircleBlue style={styles.circleBlueDecor} width={32} height={32} />
      <CircleLightBlue style={styles.circleLightBlueDecor} width={36} height={36} />

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
    ...sansBoldStyle,
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
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  halfCircleDecor: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  quarterOrangeDecor: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  quarterRedDecor: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  circleBlueDecor: {
    position: 'absolute',
    bottom: 24,
    left: 24,
  },
  circleLightBlueDecor: {
    position: 'absolute',
    top: 80,
    right: 0,
  },
});
