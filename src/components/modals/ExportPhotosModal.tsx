import { Modal, Pressable, ProgressBar, TouchableOpacity } from '@components/ui';
import type { CulledAlbumPhoto } from '@lib/culledAlbum/types';
import { formatGigabytes } from '@lib/export/formatByteSize';
import {
  openInFileManager,
  pickExportDirectory,
} from '@lib/export/nativeExport';
import {
  downloadPreparedExport,
  prepareSelectedPhotosExport,
  toExportError,
  type PreparedExport,
} from '@lib/export/prepareExport';
import type {
  ExportDirectoryInfo,
  ExportError,
  ExportFormat,
  ExportPhotosModalStep,
  ExportQuality,
  ExportZipResult,
} from '@lib/export/types';
import { photoNeedsLookBake } from '@lib/look/bakeLook';
import { captureAppEvent } from '@lib/observability/posthogClient';
import { reportError } from '@lib/observability/reportError';
import { colors } from '@lib/ui/colors';
import { fonts, sansSemiBoldStyle } from '@lib/ui/typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import IconCheckCircle from '../../assets/images/icon_check_circle.svg';
import IconCheckCircle40 from '../../assets/images/icon_check_circle_40.svg';
import IconChevronDown from '../../assets/images/icon_chevron_down.svg';
import IconChevronUp from '../../assets/images/icon_chevron_up.svg';
import IconFolderZip from '../../assets/images/icon_folder_zip.svg';
import IconLock from '../../assets/images/icon_lock.svg';

import type {ExportFigmaReviewSnapshot} from '@lib/culledAlbum/exportFigmaReview';
import { ExportFailureView } from './ExportFailureView';
import { ModalDecorations } from './ModalDecorations';
import { PopupButton, PopupIcon, PopupTitleBlock } from './UploadPopupParts';

const PROGRESS_TRACK = '#ECECEC';

const SAVE_CANCELLED_MESSAGE =
  'Saving was cancelled. Your export is still ready.';

const TRIAL_ENDED_MESSAGE =
  'Your trial has ended. You can still export saved selections.';

const EXPORT_FORMAT_OPTIONS: ReadonlyArray<{
  id: ExportFormat;
  label: string;
}> = [{ id: 'zip', label: 'ZIP' }];

type ExportPhotosModalProps = {
  visible: boolean;
  photoCount: number;
  albumId: string;
  albumName: string;
  selectedPhotos: CulledAlbumPhoto[];
  onClose: () => void;
  /** Figma visual-review overrides; freezes the modal on a dummy state. */
  review?: ExportFigmaReviewSnapshot | null;
};

type FormatExportDropdownProps = {
  value: ExportFormat;
  open: boolean;
  onToggle: () => void;
  onSelect: (format: ExportFormat) => void;
};

function FormatExportDropdown({
  value,
  open,
  onToggle,
  onSelect,
}: FormatExportDropdownProps) {
  const selectedLabel =
    EXPORT_FORMAT_OPTIONS.find(option => option.id === value)?.label ?? 'ZIP';
  // Swap icons instead of rotate — Windows misplaces transformed SVG views.
  const ChevronIcon = open ? IconChevronUp : IconChevronDown;

  return (
    <View style={styles.formatSection}>
      <View style={styles.formatRow}>
        <Text style={styles.formatLabel}>Format</Text>
        {/*
          Border lives on a non-pressable shell. On Windows, pressable focus
          chrome stacked on the same view as borderRadius draws a double outline.
        */}
        <View style={styles.formatValueShell}>
          <TouchableOpacity
            onPress={onToggle}
            style={styles.formatValue}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{expanded: open}}
            accessibilityLabel={`Export format ${selectedLabel}`}>
            <Text style={styles.formatValueText}>{selectedLabel}</Text>
            <ChevronIcon width={20} height={20} color={colors.textDark} />
          </TouchableOpacity>
        </View>
      </View>

      {/*
        Menu is a sibling of the bordered row (not a child). Windows clips
        absolute children of borderRadius views; macOS often does not.
      */}
      {open ? (
        <View style={styles.formatMenu} accessibilityRole="menu">
          {EXPORT_FORMAT_OPTIONS.map((option, index) => {
            const isLast = index === EXPORT_FORMAT_OPTIONS.length - 1;
            return (
              <Pressable
                key={option.id}
                onPress={() => onSelect(option.id)}
                style={[
                  styles.formatMenuItem,
                  !isLast && styles.formatMenuItemBorder,
                ]}
                accessibilityRole="menuitem"
                accessibilityState={{selected: option.id === value}}>
                <Text style={styles.formatMenuItemText}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

type QualityOptionProps = {
  title: string;
  description: string;
  selected: boolean;
  locked?: boolean;
  onPress: () => void;
};

function QualityOption({
  title,
  description,
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
    </Pressable>
  );
}

export function ExportPhotosModal({
  visible,
  photoCount,
  albumId,
  albumName,
  selectedPhotos,
  onClose,
  review = null,
}: ExportPhotosModalProps) {
  const [step, setStep] = useState<ExportPhotosModalStep>('options');
  const [quality, setQuality] = useState<ExportQuality>('compressed');
  const [format, setFormat] = useState<ExportFormat>('zip');
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
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
  const [exportError, setExportError] = useState<ExportError | null>(null);
  const [saveCancelled, setSaveCancelled] = useState(false);
  const prepareRequestIdRef = useRef(0);

  useEffect(() => {
    if (!visible || review != null) {
      return;
    }
    setStep('options');
    setQuality('compressed');
    setFormat('zip');
    setFormatMenuOpen(false);
    setProgressPercent(0);
    setPreparedExport(null);
    setDownloadedExport(null);
    setExportDirectory(null);
    setFailureKind(null);
    setExportError(null);
    setSaveCancelled(false);
  }, [visible, review]);

  const viewStep = review?.step ?? step;
  const viewPhotoCount = review?.photoCount ?? photoCount;
  const viewQuality = review?.quality ?? quality;
  const viewProgressPercent = review?.progressPercent ?? progressPercent;
  const viewSaveCancelled = review?.saveCancelled ?? saveCancelled;
  const viewPreparedExport = review?.preparedExport ?? preparedExport;
  const viewDownloadedExport = review?.downloadedExport ?? downloadedExport;
  const viewFailureKind = review?.failureKind ?? failureKind;
  const viewExportError = review?.exportError ?? exportError;
  const trialEnded = review?.trialEnded === true;

  useEffect(() => {
    if (viewStep !== 'ready' || !viewSaveCancelled) {
      return;
    }
    AccessibilityInfo.announceForAccessibility(SAVE_CANCELLED_MESSAGE);
  }, [viewSaveCancelled, viewStep]);

  const handleSelectCompressed = useCallback(() => {
    setFormatMenuOpen(false);
    setQuality('compressed');
  }, []);

  const handleSelectOriginal = useCallback(() => {
    setFormatMenuOpen(false);
    setQuality('original');
  }, []);

  const handleToggleFormatMenu = useCallback(() => {
    setFormatMenuOpen(prev => !prev);
  }, []);

  const handleSelectFormat = useCallback((nextFormat: ExportFormat) => {
    setFormat(nextFormat);
    setFormatMenuOpen(false);
  }, []);

  const handleDismissFormatMenu = useCallback(() => {
    setFormatMenuOpen(false);
  }, []);

  const looksNeedBake = useMemo(
    () => selectedPhotos.some(photoNeedsLookBake),
    [selectedPhotos],
  );

  const runPrepareExport = useCallback(async () => {
    const requestId = prepareRequestIdRef.current + 1;
    prepareRequestIdRef.current = requestId;
    setStep(looksNeedBake ? 'applyingLook' : 'preparing');
    setProgressPercent(0);
    setPreparedExport(null);
    setDownloadedExport(null);
    setFailureKind(null);
    setExportError(null);
    setSaveCancelled(false);
    const photoCount = selectedPhotos.length;
    const startedAt = Date.now();
    captureAppEvent('export_prepare_started', {
      albumId,
      photoCount,
      quality,
      looksNeedBake,
    });

    try {
      const result = await prepareSelectedPhotosExport({
        albumId,
        albumName,
        photos: selectedPhotos,
        quality,
        onProgress: progress => {
          if (prepareRequestIdRef.current !== requestId) {
            return;
          }
          if (progress.phase === 'applyingLook') {
            setStep('applyingLook');
          } else if (progress.phase === 'preparing') {
            setStep('preparing');
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
      captureAppEvent('export_prepare_completed', {
        albumId,
        photoCount,
        quality,
        looksNeedBake,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (prepareRequestIdRef.current !== requestId) {
        return;
      }
      const failure = toExportError(error);
      reportError(failure, {albumId, step: 'prepare'});
      setExportError(failure);
      setFailureKind('prepare');
      setStep('failed');
      captureAppEvent('export_prepare_failed', {
        albumId,
        photoCount,
        quality,
        looksNeedBake,
        durationMs: Date.now() - startedAt,
      });
    }
  }, [albumId, albumName, looksNeedBake, quality, selectedPhotos]);

  const runDownload = useCallback(
    async (directory?: ExportDirectoryInfo | null) => {
      if (!preparedExport) {
        setExportError(null);
        setFailureKind('prepare');
        setStep('failed');
        return;
      }

      const photoCount = preparedExport.photoCount ?? selectedPhotos.length;
      const startedAt = Date.now();
      setSaveCancelled(false);
      captureAppEvent('export_download_started', {
        albumId,
        photoCount,
        quality,
      });

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
        captureAppEvent('export_download_completed', {
          albumId,
          photoCount,
          quality,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        const failure = toExportError(error);
        reportError(failure, {albumId, step: 'download'});
        setExportError(failure);
        setFailureKind('download');
        setStep('failed');
        captureAppEvent('export_download_failed', {
          albumId,
          photoCount,
          quality,
          durationMs: Date.now() - startedAt,
        });
      }
    },
    [albumId, exportDirectory, preparedExport, quality, selectedPhotos.length],
  );

  const handlePrepareExport = useCallback(() => {
    setFormatMenuOpen(false);
    runPrepareExport().catch(error => reportError(error, {albumId}));
  }, [albumId, runPrepareExport]);

  const pickDirectoryAndDownload = useCallback(() => {
    // Figma: "Choose where to save it on your computer" — Save and Change
    // location both open the same native folder picker.
    pickExportDirectory()
      .then(async picked => {
        if (!picked) {
          setSaveCancelled(true);
          setStep('ready');
          return;
        }
        setExportDirectory(picked);
        await runDownload(picked);
      })
      .catch(error => {
        const failure = toExportError(error);
        reportError(failure, {albumId, step: 'pickDirectory'});
        setExportError(failure);
        setFailureKind('download');
        setStep('failed');
      });
  }, [albumId, runDownload]);

  const handleDownloadToLaptop = pickDirectoryAndDownload;

  const handleTryAgain = useCallback(() => {
    if (preparedExport && exportError?.reason !== 'sourceMissing') {
      runDownload(exportDirectory).catch(error => reportError(error, {albumId}));
      return;
    }
    runPrepareExport().catch(error => reportError(error, {albumId}));
  }, [
    albumId,
    exportDirectory,
    exportError,
    preparedExport,
    runDownload,
    runPrepareExport,
  ]);

  const handleChangeSaveLocation = pickDirectoryAndDownload;

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

  const savedCount =
    viewPreparedExport?.photoCount ?? viewDownloadedExport?.photoCount ?? viewPhotoCount;

  const modalSize =
    viewStep === 'options'
      ? {width: 720, height: trialEnded ? 560 : 520}
      : {width: 720, height: 456};

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      width={modalSize.width}
      height={modalSize.height}
      contentStyle={viewStep === 'options' ? OPTIONS_CONTENT_STYLE : undefined}>
      <ModalDecorations />

      {viewStep === 'options' && (
        <View style={styles.optionsContent}>
          {formatMenuOpen ? (
            <Pressable
              style={styles.formatDismissOverlay}
              onPress={handleDismissFormatMenu}
              accessibilityRole="button"
              accessibilityLabel="Dismiss format menu"
            />
          ) : null}

          <PopupTitleBlock
            title={`Export Photos (${viewPhotoCount})`}
            subtitle="Saved to your computer. Does not use Gump Cloud storage or download allowance."
          />

          <View style={styles.exportOptions}>
            <View style={styles.qualityCard}>
              <QualityOption
                title="Smaller-file JPG"
                description="Optimised for sharing."
                selected={viewQuality === 'compressed'}
                onPress={handleSelectCompressed}
              />
              <View style={styles.qualityPaidWrapper}>
                <QualityOption
                  title="Full-resolution JPG"
                  description="Preserves image dimensions."
                  selected={viewQuality === 'original'}
                  onPress={handleSelectOriginal}
                />
              </View>
            </View>

            <FormatExportDropdown
              value={format}
              open={formatMenuOpen}
              onToggle={handleToggleFormatMenu}
              onSelect={handleSelectFormat}
            />

            {trialEnded ? (
              <View style={styles.trialBanner}>
                <Text style={styles.trialBannerText}>{TRIAL_ENDED_MESSAGE}</Text>
              </View>
            ) : null}
          </View>

          <PopupButton
            label="Prepare Export"
            variant="primary"
            onPress={handlePrepareExport}
            single
          />
        </View>
      )}

      {viewStep === 'applyingLook' && (
        <View style={styles.centeredContent}>
          <PopupTitleBlock
            title="Applying look..."
            subtitle={`Baking looks onto ${viewPhotoCount} selected photos`}
          />
          <View style={styles.progressBlock}>
            <ProgressBar
              progress={viewProgressPercent / 100}
              height={9}
              trackColor={PROGRESS_TRACK}
            />
            <Text style={styles.progressLabel}>{viewProgressPercent}%</Text>
          </View>
        </View>
      )}

      {viewStep === 'preparing' && (
        <View style={styles.centeredContent}>
          <PopupTitleBlock
            title="Preparing export"
            subtitle={`Creating ZIP of ${viewPhotoCount} photos`}
          />
          <View style={styles.progressBlock}>
            <ProgressBar
              progress={viewProgressPercent / 100}
              height={9}
              trackColor={PROGRESS_TRACK}
            />
            <Text style={styles.progressLabel}>{viewProgressPercent}%</Text>
          </View>
        </View>
      )}

      {viewStep === 'ready' && viewPreparedExport && (
        <View style={styles.centeredContent}>
          <PopupTitleBlock
            title="Your export is ready"
            subtitle={
              viewSaveCancelled
                ? SAVE_CANCELLED_MESSAGE
                : 'Choose where to save it on your computer.'
            }
          />
          <View style={styles.fileCard}>
            <View style={styles.fileIcon}>
              <IconFolderZip width={24} height={24} color={colors.accent} />
            </View>
            <View>
              <Text style={styles.fileName}>{viewPreparedExport.fileName}</Text>
              <Text style={styles.fileMeta}>
                {viewPreparedExport.photoCount} photos  ·{'  '}
                {formatGigabytes(viewPreparedExport.byteSize)}
              </Text>
            </View>
          </View>
          <PopupButton
            label="Save to computer"
            variant="primary"
            onPress={handleDownloadToLaptop}
            autoFocus={viewSaveCancelled}
            single
          />
        </View>
      )}

      {viewStep === 'success' && viewDownloadedExport && (
        <View style={styles.centeredContent}>
          <PopupIcon>
            <IconCheckCircle40 width={40} height={40} />
          </PopupIcon>
          <PopupTitleBlock
            title="Export complete"
            subtitle={`${savedCount} photo${
              savedCount === 1 ? '' : 's'
            } saved to your computer`}
          />
          <PopupButton
            label="Open folder"
            variant="primary"
            onPress={handleOpenFolder}
            autoFocus
            single
          />
        </View>
      )}

      {viewStep === 'failed' && (
        <ExportFailureView
          reason={viewExportError?.reason ?? 'unknown'}
          failedStep={viewFailureKind === 'download' ? 'download' : 'prepare'}
          requiredBytes={viewExportError?.requiredBytes}
          missingCount={viewExportError?.missingCount}
          onTryAgain={handleTryAgain}
          onChangeSaveLocation={handleChangeSaveLocation}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}

// Options content (about 444) exceeds the 440 room of a 520 popup with 40 bottom padding.
const OPTIONS_CONTENT_STYLE = {paddingBottom: 24} as const;

const styles = StyleSheet.create({
  optionsContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 24,
    width: 480,
    position: 'relative',
    zIndex: 1,
  },
  formatDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    width: 480,
  },
  trialBanner: {
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
  },
  trialBannerText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.3,
    color: colors.textDark,
  },
  exportOptions: {
    gap: 16,
    zIndex: 2,
  },
  qualityCard: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 20,
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
    backgroundColor: colors.accent + '1A',
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
  qualityPaidWrapper: {
    gap: 8,
  },
  formatSection: {
    position: 'relative',
    zIndex: 3,
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
  formatValueShell: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 22,
    backgroundColor: colors.white,
    minHeight: 42,
    overflow: 'hidden',
  },
  formatValue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: 100,
  },
  formatValueText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 16 * 1.4,
    color: colors.textDark,
  },
  // Pull up by formatRow's bottom padding (12) so the 4px gap is from the
  // ZIP trigger, not from the outer row edge.
  formatMenu: {
    position: 'absolute',
    top: '100%',
    right: 16,
    marginTop: -8,
    minWidth: 100,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 4,
  },
  formatMenuItem: {
    paddingTop: 8,
    paddingRight: 16,
    paddingBottom: 8,
    paddingLeft: 16,
  },
  formatMenuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  formatMenuItemText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.textDark,
  },
  progressBlock: {
    width: '100%',
    maxWidth: 480,
    gap: 12,
  },
  progressLabel: {
    ...sansSemiBoldStyle,
    fontSize: 14,
    lineHeight: 14 * 1.44,
    color: colors.textMuted,
    textAlign: 'center',
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
    width: 38,
    height: 38,
    backgroundColor: colors.cardGrayLight,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    ...sansSemiBoldStyle,
    fontSize: 16,
    color: colors.textDark,
  },
  fileMeta: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 12 * 1.6,
    color: colors.textMuted,
  },
});
