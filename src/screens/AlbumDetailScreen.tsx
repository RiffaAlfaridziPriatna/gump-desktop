import {PhotoGrid, type PhotoGridHandle} from '@components/photo/PhotoGrid';
import {PhotoGridSkeleton} from '@components/photo/PhotoGridSkeleton';
import {AlbumDetailFabStack} from '@components/navigation/AlbumDetailFabStack';
import {
  ProfileMenuAvatar,
  ProfileMenuPopup,
} from '@components/navigation/ProfileMenu';
import {UploadAwareModalShell} from '@components/navigation/UploadAwareModalShell';
import {UploadToast} from '@components/upload/UploadToast';
import {
  useCulledAlbumActions,
  useCulledAlbumLocalImportProgress,
  useCulledAlbumStore,
} from '@context/culledAlbum';
import {useAlbumQueueOperation} from '@lib/culledAlbum/uploadQueueStore';
import {scheduleResolveExistingThumbnails} from '@lib/culledAlbum/thumbnailBackfill';
import {isUsableThumbnailUri} from '@lib/storage/localStorage';
import {pickImages} from '@lib/media/filePicker';
import {useAlbumDetailGridPhotos} from '@hooks/useAlbumDetailGridPhotos';
import {useCulledAlbumPhotos} from '@hooks/useCulledAlbumPhotos';
import {useProfileMenu} from '@hooks/useProfileMenu';
import {useUploadAwareModalScreen} from '@hooks/useUploadAwareModalScreen';
import {useLayout} from '@hooks/useLayout';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useIsFocused} from '@react-navigation/native';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {TouchableOpacity} from '@components/ui';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconChevronLeft from '../assets/images/icon_chevron_left.svg';
import IconScissors from '../assets/images/icon_scissors.svg';
import GumpLogo from '../assets/images/logo.svg';

type Props = StackScreenProps<MainStackParamList, 'AlbumDetail'>;

type AlbumDetailBodyProps = {
  albumId: string;
  screenPaddingHorizontal: number;
  showImportSkeleton: boolean;
  photoGridRef: RefObject<PhotoGridHandle | null>;
};

function AlbumDetailUploadingBody({
  screenPaddingHorizontal,
}: {
  screenPaddingHorizontal: number;
}) {
  return <PhotoGridSkeleton horizontalPadding={screenPaddingHorizontal} />;
}

const AlbumDetailGridBody = memo(function AlbumDetailGridBody({
  albumId,
  screenPaddingHorizontal,
  photoGridRef,
}: {
  albumId: string;
  screenPaddingHorizontal: number;
  photoGridRef: RefObject<PhotoGridHandle | null>;
}) {
  const gridPhotos = useAlbumDetailGridPhotos(albumId);
  const {loadingPhotos, loadError} = useCulledAlbumPhotos(albumId, {
    skipInitialLoad: gridPhotos.length > 0,
  });

  useEffect(() => {
    if (gridPhotos.length === 0) {
      return;
    }

    const firstPaintIds = gridPhotos
      .slice(0, 24)
      .filter(item => !isUsableThumbnailUri(item.file.thumbnailUri))
      .map(item => item.photoId);
    if (firstPaintIds.length > 0) {
      scheduleResolveExistingThumbnails(albumId, firstPaintIds);
    }
  }, [albumId, gridPhotos.length]);

  if (loadingPhotos && gridPhotos.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>{loadError}</Text>
      </View>
    );
  }

  return (
    <PhotoGrid
      ref={photoGridRef}
      items={gridPhotos}
      albumId={albumId}
      horizontalPadding={screenPaddingHorizontal}
    />
  );
});

const AlbumDetailBody = memo(function AlbumDetailBody({
  albumId,
  screenPaddingHorizontal,
  showImportSkeleton,
  photoGridRef,
}: AlbumDetailBodyProps) {
  if (showImportSkeleton) {
    return (
      <AlbumDetailUploadingBody
        screenPaddingHorizontal={screenPaddingHorizontal}
      />
    );
  }

  return (
    <AlbumDetailGridBody
      albumId={albumId}
      screenPaddingHorizontal={screenPaddingHorizontal}
      photoGridRef={photoGridRef}
    />
  );
});

export default function AlbumDetailScreen({navigation, route}: Props) {
  const {albumId, albumName, ownerName, skipResumeImport} = route.params;
  const {shellProps, handleBack, handleBackPressIn} =
    useUploadAwareModalScreen(navigation, route.params.instant, {albumId});
  const {isMobileLayout, screenPaddingHorizontal} = useLayout();
  const isFocused = useIsFocused();
  const {resumeInFlightWork, startAnalysis, addPhotos} = useCulledAlbumActions();
  const profileMenu = useProfileMenu();
  const [cullingActive, setCullingActive] = useState(false);
  const photoGridRef = useRef<PhotoGridHandle | null>(null);

  const localImportProgress = useCulledAlbumLocalImportProgress(albumId);
  const totalPhotos = useCulledAlbumStore(
    state => state.albums[albumId]?.totalPhotos ?? 0,
  );
  const batchTotal = useCulledAlbumStore(
    state => state.albums[albumId]?.localImportBatchTotal ?? 0,
  );

  const isUploading =
    (localImportProgress?.pending ?? 0) + (localImportProgress?.uploading ?? 0) >
    0;
  const hasUploadedPhotos =
    (localImportProgress?.uploaded ?? 0) > 0 ||
    (!isUploading && totalPhotos > 0);

  // Show skeleton during entire upload to avoid grid rendering overhead while importing.
  // For append scenarios (adding to existing album), keep the grid visible.
  const isAppendingToExistingAlbum = totalPhotos > batchTotal && batchTotal > 0;
  const showImportSkeleton = isUploading && !isAppendingToExistingAlbum;

  const displayTotalPhotos = isUploading
    ? Math.max(totalPhotos, batchTotal)
    : totalPhotos;

  const analysisBatchIdCount = useCulledAlbumStore(
    state => state.albums[albumId]?.analysisBatchPhotoIds.length ?? 0,
  );
  const analysisBatchCounts = useCulledAlbumStore(
    state => state.albums[albumId]?.analysisBatchCounts,
  );

  const analysisQueue = useAlbumQueueOperation(albumId, 'analyze');
  const isAnalysisFinalizing = analysisQueue.status === 'finalizing';
  const isAnalysisQueueDone =
    analysisQueue.status === 'completed' || analysisQueue.status === 'failed';

  const cullingSnapshot = useMemo(() => {
    if (analysisBatchIdCount === 0) {
      return {
        inProgress: false,
        complete: false,
        hasAnalyzed: false,
      };
    }

    if (!analysisBatchCounts) {
      return {
        inProgress: true,
        complete: false,
        hasAnalyzed: false,
      };
    }

    return {
      inProgress:
        analysisBatchCounts.pending > 0 || analysisBatchCounts.analyzing > 0,
      complete:
        analysisBatchCounts.pending === 0 &&
        analysisBatchCounts.analyzing === 0,
      hasAnalyzed: analysisBatchCounts.analyzed > 0,
    };
  }, [analysisBatchCounts, analysisBatchIdCount]);

  const isCullingInProgress =
    analysisQueue.status === 'active' ||
    isAnalysisFinalizing ||
    ((cullingActive || cullingSnapshot.inProgress) &&
      !cullingSnapshot.complete &&
      !isAnalysisQueueDone);

  useEffect(() => {
    if (cullingSnapshot.inProgress || isAnalysisFinalizing) {
      setCullingActive(true);
    }
  }, [cullingSnapshot.inProgress, isAnalysisFinalizing]);

  useEffect(() => {
    if (!isFocused || skipResumeImport) {
      return;
    }
    resumeInFlightWork(albumId);
  }, [albumId, isFocused, resumeInFlightWork, skipResumeImport]);

  useEffect(() => {
    if (
      !cullingActive ||
      !cullingSnapshot.complete ||
      cullingSnapshot.hasAnalyzed ||
      analysisQueue.status !== 'failed'
    ) {
      return;
    }
    setCullingActive(false);
  }, [
    analysisQueue.status,
    cullingActive,
    cullingSnapshot.complete,
    cullingSnapshot.hasAnalyzed,
  ]);

  useEffect(() => {
    if (
      !isFocused ||
      !cullingActive ||
      analysisQueue.status !== 'completed' ||
      !cullingSnapshot.hasAnalyzed
    ) {
      return;
    }
    navigation.replace('CulledAlbumDetail', {albumId});
  }, [
    albumId,
    analysisQueue.status,
    cullingActive,
    cullingSnapshot.hasAnalyzed,
    isFocused,
    navigation,
  ]);

  function handleStartCulling() {
    if (!hasUploadedPhotos || isUploading || cullingActive) {
      return;
    }
    setCullingActive(true);
    startAnalysis(albumId);
  }

  const handleAddPhotos = useCallback(async () => {
    if (isUploading || isCullingInProgress) {
      return;
    }

    try {
      const files = await pickImages();
      if (files.length === 0) {
        return;
      }
      addPhotos(albumId, files);
    } catch (error) {
      console.error('[AlbumDetailScreen] Failed to pick images', error);
    }
  }, [addPhotos, albumId, isCullingInProgress, isUploading]);

  const handleScrollToTop = useCallback(() => {
    photoGridRef.current?.scrollToTop();
  }, []);

  return (
    <UploadAwareModalShell {...shellProps}>
      <SafeAreaView style={styles.container}>
      <View
        style={[
          styles.header,
          {paddingHorizontal: screenPaddingHorizontal},
          isMobileLayout && styles.headerMobile,
        ]}>
        <View style={[styles.headerLeft, isMobileLayout && styles.headerLeftMobile]}>
          <GumpLogo width={112} height={40} />
          <TouchableOpacity
            style={styles.backButton}
            onPressIn={handleBackPressIn}
            onPress={handleBack}
            activeOpacity={0.7}>
            <IconChevronLeft width={24} height={24} color={colors.accent} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <ProfileMenuAvatar menu={profileMenu} />
      </View>

      <View
        style={[
          styles.titleRow,
          {paddingHorizontal: screenPaddingHorizontal},
          isMobileLayout && styles.titleRowMobile,
        ]}>
        <View style={styles.titleColumn}>
          <Text style={styles.title}>{ownerName}</Text>
          <Text style={styles.subtitle}>{albumName}</Text>
        </View>
        <View
          style={[
            styles.actionsColumn,
            isMobileLayout && styles.actionsColumnMobile,
          ]}>
          <Text style={styles.totalPhotos}>
            Total Photos{' '}
            <Text style={styles.totalPhotosValue}>{displayTotalPhotos}</Text>
          </Text>
          <TouchableOpacity
            style={[
              styles.cullingButton,
              isCullingInProgress && styles.cullingButtonInProgress,
              (isUploading || !hasUploadedPhotos || cullingActive) &&
                !isCullingInProgress &&
                styles.cullingButtonDisabled,
            ]}
            disabled={
              isUploading ||
              !hasUploadedPhotos ||
              (cullingActive && !isCullingInProgress)
            }
            onPress={handleStartCulling}
            activeOpacity={0.8}>
            <IconScissors
              width={16}
              height={16}
              color={isCullingInProgress ? colors.accent : colors.white}
            />
            <Text
              style={[
                styles.cullingText,
                isCullingInProgress && styles.cullingTextInProgress,
              ]}>
              {isCullingInProgress ? 'Culling in Progress...' : 'Start Culling'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        <AlbumDetailBody
          albumId={albumId}
          screenPaddingHorizontal={screenPaddingHorizontal}
          showImportSkeleton={showImportSkeleton}
          photoGridRef={photoGridRef}
        />
      </View>
      {isUploading ? null : (
        <AlbumDetailFabStack
          onScrollToTop={handleScrollToTop}
          onAddPhotos={handleAddPhotos}
          hideAdd={isCullingInProgress || cullingActive}
        />
      )}
      <UploadToast mode="upload" albumId={albumId} />
      {isCullingInProgress ? (
        <UploadToast mode="analyze" albumId={albumId} />
      ) : null}
      <ProfileMenuPopup
        menu={profileMenu}
        rightOffset={screenPaddingHorizontal}
      />
    </SafeAreaView>
    </UploadAwareModalShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingBottom: 24,
  },
  headerMobile: {
    paddingTop: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 40,
  },
  headerLeftMobile: {
    gap: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    ...sansBoldStyle,
    fontSize: 20,
    color: colors.accent,
    lineHeight: 20 * 1.2,
    letterSpacing: 0,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 20,
    paddingBottom: 16,
    gap: 10,
  },
  titleRowMobile: {
    flexDirection: 'column',
    paddingTop: 12,
    gap: 16,
  },
  titleColumn: {
    flex: 1,
    gap: 8,
  },
  actionsColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  actionsColumnMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 28 * 1.2,
    letterSpacing: 0.5,
    color: colors.text,
    fontWeight: '700',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.text,
    lineHeight: 16 * 1.2,
  },
  cullingButton: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingLeft: 20,
    paddingRight: 24,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cullingButtonInProgress: {
    backgroundColor: colors.accent + '14',
  },
  cullingButtonDisabled: {
    opacity: 0.2,
  },
  cullingText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  cullingTextInProgress: {
    color: colors.accent,
  },
  totalPhotos: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
  },
  totalPhotosValue: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.text,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
