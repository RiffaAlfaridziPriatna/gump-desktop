import { Modal, Pressable, ProgressBar, TouchableOpacity } from '@components/ui';
import type { CulledAlbumPhoto } from '@lib/culledAlbum/types';
import { IS_PAID_PLAN } from '@lib/export/exportPlan';
import { formatByteSize } from '@lib/export/formatByteSize';
import {
  openInFileManager,
  pickExportDirectory,
} from '@lib/export/nativeExport';
import {
  downloadPreparedExport,
  prepareSelectedPhotosExport,
  type PreparedExport,
} from '@lib/export/prepareExport';
import type {
  ExportDirectoryInfo,
  ExportPhotosModalStep,
  ExportQuality,
  ExportZipResult,
} from '@lib/export/types';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import IconCheckCircle from '../../assets/images/icon_check_circle.svg';
import IconChevronDown from '../../assets/images/icon_chevron_down.svg';
import IconChevronRight from '../../assets/images/icon_chevron_right.svg';
import IconFolder from '../../assets/images/icon_folder.svg';
import IconFolderZip from '../../assets/images/icon_folder_zip.svg';
import IconLock from '../../assets/images/icon_lock.svg';
import CircleBlue from '../../assets/images/upload/blue_circle.svg';
import HalfCircle from '../../assets/images/upload/half_circle.svg';
import CircleLightBlue from '../../assets/images/upload/light_blue_circle.svg';
import QuarterCircleOrange from '../../assets/images/upload/orange_quarter_circle.svg';
import QuarterCircleRed from '../../assets/images/upload/red_quarter_circle.svg';

type ExportPhotosModalProps = {
  visible: boolean;
  photoCount: number;
  albumId: string;
  albumName: string;
  selectedPhotos: CulledAlbumPhoto[];
  onClose: () => void;
};

type QualityOptionProps = {
  title: string;
  description: string;
  statusLabels: string[];
  selected: boolean;
  locked?: boolean;
  onPress: () => void;
};

function QualityOption({
  title,
  description,
  statusLabels,
  selected,
  locked = false,
  onPress,
}: QualityOptionProps) {
  const muted = locked && !selected;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.qualityOption,
        selected && styles.qualityOptionSelected,
      ]}
      accessibilityRole="button"
      accessibilityState={{selected}}>
      <View style={styles.qualityOptionContent}>
        {selected ? (
          <IconCheckCircle width={24} height={24} color={colors.accent} />
        ) : (
          <View style={styles.radioEmpty} />
        )}

        <View style={styles.qualityOptionMain}>
          <View style={styles.qualityOptionTitleRow}>
            {locked && (
              <IconLock width={12} height={12} color={colors.iconLight} />
            )}
            <Text style={[styles.qualityTitle, muted && styles.qualityTitleMuted]}>
              {title}
            </Text>
          </View>
          <Text
            style={[
              styles.qualityDescription,
              muted && styles.qualityDescriptionMuted,
            ]}>
            {description}
          </Text>
        </View>
      </View>
      <View>
        {statusLabels.map((statusLabel, index) => (
          <Text key={index} style={styles.qualityStatus}>
            {statusLabel}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

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

export function ExportPhotosModal({
  visible,
  photoCount,
  albumId,
  albumName,
  selectedPhotos,
  onClose,
}: ExportPhotosModalProps) {
  const isPaidPlan = IS_PAID_PLAN;
  const [step, setStep] = useState<ExportPhotosModalStep>('options');
  const [quality, setQuality] = useState<ExportQuality>('compressed');
  const [showUpgradeHint, setShowUpgradeHint] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [preparedExport, setPreparedExport] = useState<PreparedExport | null>(
    null,
  );
  const [downloadedExport, setDownloadedExport] =
    useState<ExportZipResult | null>(null);
  const [exportDirectory, setExportDirectory] =
    useState<ExportDirectoryInfo | null>(null);
  const [failureKind, setFailureKind] = useState<'prepare' | 'download' | null>(
    null,
  );
  const prepareRequestIdRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setStep('options');
    setQuality('compressed');
    setShowUpgradeHint(false);
    setProgressPercent(0);
    setPreparedExport(null);
    setDownloadedExport(null);
    setExportDirectory(null);
    setFailureKind(null);
  }, [visible]);

  const handleSelectCompressed = useCallback(() => {
    setQuality('compressed');
    setShowUpgradeHint(false);
  }, []);

  const handleSelectOriginal = useCallback(() => {
    if (!isPaidPlan) {
      setShowUpgradeHint(true);
      return;
    }
    setQuality('original');
    setShowUpgradeHint(false);
  }, [isPaidPlan]);

  const runPrepareExport = useCallback(async () => {
    const requestId = prepareRequestIdRef.current + 1;
    prepareRequestIdRef.current = requestId;
    setStep('preparing');
    setProgressPercent(0);
    setPreparedExport(null);
    setDownloadedExport(null);
    setFailureKind(null);

    try {
      const result = await prepareSelectedPhotosExport({
        albumId,
        albumName,
        photos: selectedPhotos,
        quality: isPaidPlan ? quality : 'compressed',
        onProgress: progress => {
          if (prepareRequestIdRef.current !== requestId) {
            return;
          }
          setProgressPercent(progress.percent);
        },
      });

      if (prepareRequestIdRef.current !== requestId) {
        return;
      }

      setPreparedExport(result);
      setProgressPercent(100);
      setStep('ready');
    } catch (error) {
      if (prepareRequestIdRef.current !== requestId) {
        return;
      }
      console.error('[ExportPhotosModal] Failed to prepare export', error);
      setFailureKind('prepare');
      setStep('failed');
    }
  }, [albumId, albumName, isPaidPlan, quality, selectedPhotos]);

  const runDownload = useCallback(
    async (directory?: ExportDirectoryInfo | null) => {
      if (!preparedExport) {
        setFailureKind('prepare');
        setStep('failed');
        return;
      }

      try {
        const downloaded = await downloadPreparedExport({
          prepared: preparedExport,
          directory: directory ?? exportDirectory,
        });
        setDownloadedExport(downloaded);
        setExportDirectory({
          path: downloaded.path.replace(/[/\\][^/\\]+$/, ''),
          displayPath: downloaded.displayPath,
        });
        setFailureKind(null);
        setStep('success');
      } catch (error) {
        console.error('[ExportPhotosModal] Failed to download export', error);
        setFailureKind('download');
        setStep('failed');
      }
    },
    [exportDirectory, preparedExport],
  );

  const handlePrepareExport = useCallback(() => {
    runPrepareExport().catch(() => undefined);
  }, [runPrepareExport]);

  const handleDownloadToLaptop = useCallback(() => {
    runDownload().catch(() => undefined);
  }, [runDownload]);

  const handleTryAgain = useCallback(() => {
    if (preparedExport) {
      runDownload(exportDirectory).catch(() => undefined);
      return;
    }
    runPrepareExport().catch(() => undefined);
  }, [exportDirectory, preparedExport, runDownload, runPrepareExport]);

  const handleChangeSaveLocation = useCallback(() => {
    pickExportDirectory()
      .then(async picked => {
        if (!picked) {
          return;
        }
        setExportDirectory(picked);
        await runDownload(picked);
      })
      .catch(error => {
        console.error(
          '[ExportPhotosModal] Failed to change save location',
          error,
        );
        setStep('failed');
      });
  }, [runDownload]);

  const handleOpenFolder = useCallback(() => {
    if (!downloadedExport) {
      onClose();
      return;
    }
    openInFileManager(downloadedExport.path)
      .catch(error => {
        console.error('[ExportPhotosModal] Failed to open folder', error);
      })
      .finally(() => {
        onClose();
      });
  }, [downloadedExport, onClose]);

  const modalSize =
    step === 'options'
      ? { width: 720, height: showUpgradeHint ? 540 : 500 }
      : { width: 720, height: 440 };
     

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      width={modalSize.width}
      height={modalSize.height}>
      <ModalDecor />

      {step === 'options' && (
        <View style={styles.optionsContent}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Export Photos ({photoCount})</Text>
            <Text style={styles.subtitle}>
              Saved to your laptop — doesn&apos;t use cloud storage or monthly
              data
            </Text>
          </View>

          <View style={styles.exportOptions}>
            <View style={styles.qualityCard}>
              <QualityOption
                title="Compressed JPG"
                description="Looks great for online viewing, smaller files."
                statusLabels={[
                  isPaidPlan ? "Smaller file size" : "",
                  "Included in your plan",
                ].filter(Boolean)}
                selected={quality === 'compressed'}
                onPress={handleSelectCompressed}
              />
              <View style={styles.qualityPaidWrapper}>
                <QualityOption
                  title="Original JPG"
                  description="Full resolution, best for editing and large prints."
                  statusLabels={
                    isPaidPlan ? [
                      "Full resolution",
                      "Included in your plan",
                    ] : [
                      "Available on paid plans",
                    ]
                  }
                  selected={quality === 'original'}
                  locked={!isPaidPlan}
                  onPress={handleSelectOriginal}
                />
                {showUpgradeHint && !isPaidPlan && (
                  <View style={styles.upgradeRow}>
                    <Text style={styles.upgradeText}>
                      Upgrade to export original-quality photos.
                    </Text>
                    {/* TODO: Wire Upgrade Plan CTA to billing / paywall flow */}
                    <TouchableOpacity
                      onPress={() => {
                        // TODO: Navigate to upgrade / pricing
                      }}
                      activeOpacity={0.8}
                      style={styles.upgradeCtaButton}>
                      <Text style={styles.upgradeCta}>Upgrade Plan</Text>
                      <IconChevronRight width={24} height={24} color={colors.accent} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.formatRow}>
              <Text style={styles.formatLabel}>Format</Text>
              <View style={styles.formatValue}>
                <Text style={styles.formatValueText}>ZIP</Text>
                <IconChevronDown width={20} height={20} color={colors.textMuted} />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handlePrepareExport}
            activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>Prepare Export</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'preparing' && (
        <View style={styles.centeredContent}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Preparing export</Text>
            <Text style={styles.subtitle}>
              Creating ZIP of {photoCount} photos
            </Text>
          </View>
          <View style={styles.progressBlock}>
            <ProgressBar
              progress={progressPercent / 100}
              height={8}
              style={styles.progressBar}
            />
            <Text style={styles.progressLabel}>{progressPercent}%</Text>
          </View>
        </View>
      )}

      {step === 'ready' && preparedExport && (
        <View style={styles.centeredContent}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Your export is ready</Text>
            <Text style={styles.subtitle}>Download it to your laptop</Text>
          </View>
          <View style={styles.fileCard}>
            <View style={styles.fileIcon}>
              <IconFolderZip width={24} height={24} color={colors.accent} />
            </View>
            <View>
              <Text style={styles.fileName}>{preparedExport.fileName}</Text>
              <Text style={styles.fileMeta}>
                {preparedExport.photoCount} photos ·{' '}
                {formatByteSize(preparedExport.byteSize)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleDownloadToLaptop}
            activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>Download to Laptop</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {step === 'success' && downloadedExport && (
        <View style={styles.centeredContent}>
          <IconCheckCircle width={48} height={48} color={colors.iconGreen} />
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Download complete</Text>
            <Text style={styles.subtitle}>
              {downloadedExport.fileName} ·{' '}
              {formatByteSize(downloadedExport.byteSize)}
            </Text>
          </View>
          <View style={styles.pathCardSuccess}>
            <IconFolder width={24} height={24} color={colors.textMuted} />
            <Text style={styles.pathCardTextBold}>
              {downloadedExport.displayPath}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleOpenFolder}
            activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>Open Folder</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'failed' && (
        <View style={styles.centeredContent}>
          <View style={styles.errorBadge}>
            <Text style={styles.errorBadgeText}>!</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>
              {failureKind === 'prepare' ? 'Export failed' : 'Download failed'}
            </Text>
            <Text style={styles.subtitle}>
              {failureKind === 'prepare'
                ? 'Something went wrong while preparing your ZIP.'
                : 'Your export is still ready — nothing was lost.'}
            </Text>
          </View>
          <View style={styles.failedActions}>
            <TouchableOpacity
              style={[styles.primaryButton, styles.failedPrimary]}
              onPress={handleTryAgain}
              activeOpacity={0.8}>
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>
            {failureKind !== 'prepare' ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleChangeSaveLocation}
                activeOpacity={0.8}
                disabled={!preparedExport}>
                <Text style={styles.secondaryButtonText}>
                  Change save location
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  optionsContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 20,
    width: 480,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    width: 480,
  },
  titleBlock: {
    gap: 12,
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 28 * 1.2,
    color: colors.textDark,
    textAlign: 'center',
    fontWeight: '700',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.4,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: '400',
  },
  exportOptions: {
    gap: 16,
  },
  qualityCard: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    overflow: 'hidden',
    padding: 16,
    gap: 12,
  },
  qualityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
  },
  qualityOptionSelected: {
    backgroundColor: colors.accent + '14',
    borderColor: colors.accent,
  },
  qualityOptionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qualityOptionMain: {
    flex: 1,
    gap: 2,
  },
  qualityOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  radioEmpty: {
    width: 20,
    height: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.radioEmpty,
    marginRight: 4,
  },
  qualityTitle: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textDark,
    fontWeight: '500',
  },
  qualityTitleMuted: {
    color: colors.textMuted + '80',
  },
  qualityDescription: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 12 * 1.4,
    color: colors.textMuted,
    letterSpacing: 0,
  },
  qualityDescriptionMuted: {
    color: colors.textMuted + '80',
  },
  qualityStatus: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 0,
    textAlign: "right",
  },
  qualityPaidWrapper: {
    gap: 8,
  },
  upgradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.cardGrayLight,
  },
  upgradeText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.2,
    color: colors.textDark,
  },
  upgradeCtaButton: {
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeCta: {
    ...sansBoldStyle,
    fontSize: 14,
    lineHeight: 14 * 1.2,
    fontWeight: '600',
    color: colors.accent,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  formatLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textDark,
  },
  formatValue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: 100,
  },
  formatValueText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.textDark,
  },
  primaryButton: {
    alignSelf: 'center',
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 40,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...sansBoldStyle,
    fontSize: 14,
    color: colors.accent,
  },
  progressBlock: {
    width: '100%',
    maxWidth: 480,
    gap: 12,
  },
  progressBar: {
    borderRadius: 4,
  },
  progressLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: '600',
  },
  fileCard: {
    alignSelf: 'center',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  fileIcon: {
    width: 40,
    height: 40,
    backgroundColor: colors.cardGrayLight,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.textDark,
  },
  fileMeta: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textMuted,
  },
  pathCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.progressTrack,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pathCardSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: colors.progressTrack,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  pathCardText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
  },
  pathCardTextBold: {
    fontFamily: fonts.sans,
    fontWeight: '500',
    fontSize: 16,
    lineHeight: 16 * 1.2,
    color: colors.textDark,
    letterSpacing: 0,
  },
  successBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBadgeText: {
    ...sansBoldStyle,
    fontSize: 20,
    color: colors.white,
  },
  errorBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBadgeText: {
    ...sansBoldStyle,
    fontSize: 22,
    color: colors.white,
  },
  failedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 420,
    marginTop: 8,
  },
  failedPrimary: {
    flex: 1,
    alignSelf: 'stretch',
    paddingHorizontal: 16,
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
