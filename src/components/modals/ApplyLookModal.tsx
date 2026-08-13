import { ContainedLookImage } from '@components/look/ContainedLookImage';
import { IntensitySlider } from '@components/look/IntensitySlider';
import { Modal, Pressable, TouchableOpacity } from '@components/ui';
import type { CulledAlbumPhoto } from '@lib/culledAlbum/types';
import { LOOK_CATALOG } from '@lib/look/lookCatalog';
import {
  DEFAULT_LOOK_INTENSITY,
  type LookId,
} from '@lib/look/types';
import { resolveDetailDisplayUri, resolveGridDisplayUri } from '@lib/storage/localStorage';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import CircleBlue from '../../assets/images/upload/blue_circle.svg';
import HalfCircle from '../../assets/images/upload/half_circle.svg';
import CircleLightBlue from '../../assets/images/upload/light_blue_circle.svg';
import QuarterCircleOrange from '../../assets/images/upload/orange_quarter_circle.svg';
import QuarterCircleRed from '../../assets/images/upload/red_quarter_circle.svg';

type ApplyLookModalProps = {
  visible: boolean;
  selectedPhotos: CulledAlbumPhoto[];
  onClose: () => void;
  onApply: (lookId: LookId, lookIntensity: number) => Promise<void>;
};

function ModalDecor() {
  return (
    <>
      <HalfCircle style={styles.halfCircleDecor} width={72} />
      <QuarterCircleOrange
        style={styles.quarterOrangeDecor}
        width={98}
        height={98}
      />
      <QuarterCircleRed style={styles.quarterRedDecor} width={80} height={80} />
      <CircleBlue style={styles.circleBlueDecor} width={32} height={32} />
      <CircleLightBlue
        style={styles.circleLightBlueDecor}
        width={36}
        height={36}
      />
    </>
  );
}

function resolvePreviewUri(photo: CulledAlbumPhoto | undefined): string {
  if (!photo) {
    return '';
  }
  return (
    resolveDetailDisplayUri(photo.file) ||
    resolveGridDisplayUri(photo.file) ||
    photo.file.uri
  );
}

export function ApplyLookModal({
  visible,
  selectedPhotos,
  onClose,
  onApply,
}: ApplyLookModalProps) {
  const previewPhoto = selectedPhotos[0];
  const previewUri = useMemo(
    () => resolvePreviewUri(previewPhoto),
    [previewPhoto],
  );

  const [lookId, setLookId] = useState<LookId>('cleanNatural');
  const [intensity, setIntensity] = useState(DEFAULT_LOOK_INTENSITY);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const seed = selectedPhotos[0];
    setLookId(
      seed?.lookId && seed.lookId !== 'original' ? seed.lookId : 'cleanNatural',
    );
    setIntensity(seed?.lookIntensity ?? DEFAULT_LOOK_INTENSITY);
    setApplying(false);
  }, [selectedPhotos, visible]);

  const intensityDisabled = lookId === 'original';

  const handleApply = useCallback(async () => {
    if (applying || selectedPhotos.length === 0) {
      return;
    }
    setApplying(true);
    try {
      await onApply(
        lookId,
        intensityDisabled ? DEFAULT_LOOK_INTENSITY : intensity,
      );
      onClose();
    } catch (error) {
      console.error('[ApplyLookModal] Failed to apply look', error);
    } finally {
      setApplying(false);
    }
  }, [
    applying,
    intensity,
    intensityDisabled,
    lookId,
    onApply,
    onClose,
    selectedPhotos.length,
  ]);

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      width={720}
      height={740}>
      <ModalDecor />
      <View style={styles.content}>
        <Text style={styles.title}>Apply Look</Text>

        <View style={styles.previewContainer}>
          {previewUri ? (
            <ContainedLookImage
              uri={previewUri}
              width={480}
              height={326}
              lookId={lookId}
              lookIntensity={intensityDisabled ? 0 : intensity}
              isTransparent={false}
            />
          ) : (
            <View style={styles.previewPlaceholder} />
          )}

          <View style={styles.lookRow}>
            {LOOK_CATALOG.map(look => {
              const selected = look.id === lookId;
              return (
                <Pressable
                  key={look.id}
                  onPress={() => setLookId(look.id)}
                  style={[styles.lookItem, selected && styles.lookItemSelected]}
                  accessibilityRole="button"
                  accessibilityState={{selected}}
                  accessibilityLabel={look.label}>
                  {previewUri ? (
                    <ContainedLookImage
                      uri={previewUri}
                      width={106}
                      height={70}
                      borderRadius={4}
                      lookId={look.id}
                      // Chips match Figma: always show full-strength look.
                      lookIntensity={
                        look.id === 'original' ? 0 : 100
                      }
                    />
                  ) : (
                    <View
                      style={[
                        styles.thumbPlaceholder,
                        selected && styles.thumbPlaceholderSelected,
                      ]}
                    />
                  )}
                  <Text
                    style={[
                      styles.lookLabel,
                      selected && styles.lookLabelSelected,
                    ]}
                    numberOfLines={1}>
                    {look.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.intensityRow}>
            <Text style={styles.intensityLabel}>Intensity</Text>
            <IntensitySlider
              value={intensity}
              onChange={setIntensity}
              disabled={intensityDisabled}
            />
            <Text style={styles.intensityValue}>
              {intensityDisabled ? '—' : `${intensity}%`}
            </Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.applyButton, applying && styles.applyButtonDisabled]}
            onPress={handleApply}
            disabled={applying || selectedPhotos.length === 0}
            activeOpacity={0.8}>
            <Text style={styles.applyButtonText}>
              {applying ? 'Applying...' : 'Apply to Selected'}
            </Text>
          </TouchableOpacity>

          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 28 * 1.2,
    color: colors.textDark,
    textAlign: 'center',
    fontWeight: '700',
  },
  previewContainer: {
    gap: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholder: {
    width: 480,
    height: 326,
    borderRadius: 8,
    backgroundColor: colors.cardGrayLight,
  },
  lookRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    width: '100%',
  },
  lookItem: {
    width: 108,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 4,
    paddingBottom: 6,
  },
  lookItemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + "1A",
  },
  thumbPlaceholder: {
    width: 106,
    height: 70,
    borderRadius: 4,
    backgroundColor: colors.cardGrayLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  thumbPlaceholderSelected: {
    borderColor: colors.accent,
  },
  lookLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  lookLabelSelected: {
    ...sansBoldStyle,
    fontSize: 12,
    lineHeight: 14,
    color: colors.textDark,
  },
  intensityRow: {
    width: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  intensityLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textDark,
  },
  intensityValue: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textDark,
    textAlign: 'right',
    width: 40,
    fontVariant: ['tabular-nums'],
  },
  buttonContainer: {
    gap: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButton: {
    minHeight: 48,
    minWidth: 240,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  cancelText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
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
