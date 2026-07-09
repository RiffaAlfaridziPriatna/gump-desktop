import {PhotoGrid} from '@components/photo/PhotoGrid';
import {PhotoGridSkeleton} from '@components/photo/PhotoGridSkeleton';
import {UploadAwareModalShell} from '@components/navigation/UploadAwareModalShell';
import {UploadToast} from '@components/upload/UploadToast';
import {
  useCulledAlbumActions,
  useCulledAlbumLocalImportProgress,
  useCulledAlbumStore,
} from '@context/culledAlbum';
import {useAlbumDetailGridPhotos} from '@hooks/useAlbumDetailGridPhotos';
import {useCulledAlbumPhotos} from '@hooks/useCulledAlbumPhotos';
import {useUploadAwareModalScreen} from '@hooks/useUploadAwareModalScreen';
import {useLayout} from '@hooks/useLayout';
import {scheduleThumbnailBackfill} from '@lib/culledAlbum/thumbnailBackfill';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useIsFocused} from '@react-navigation/native';
import {useEffect, useState} from 'react';
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
  isLocalImportActive: boolean;
};

function AlbumDetailUploadingBody({
  screenPaddingHorizontal,
}: {
  screenPaddingHorizontal: number;
}) {
  return <PhotoGridSkeleton horizontalPadding={screenPaddingHorizontal} />;
}

function AlbumDetailGridBody({
  albumId,
  screenPaddingHorizontal,
}: {
  albumId: string;
  screenPaddingHorizontal: number;
}) {
  const gridPhotos = useAlbumDetailGridPhotos(albumId);
  const {loadingPhotos, loadError} = useCulledAlbumPhotos(albumId, {
    skipInitialLoad: gridPhotos.length > 0,
  });

  useEffect(() => {
    if (gridPhotos.length > 0) {
      scheduleThumbnailBackfill(albumId);
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
      items={gridPhotos}
      albumId={albumId}
      horizontalPadding={screenPaddingHorizontal}
    />
  );
}

function AlbumDetailBody({
  albumId,
  screenPaddingHorizontal,
  isLocalImportActive,
}: AlbumDetailBodyProps) {
  if (isLocalImportActive) {
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
    />
  );
}

export default function AlbumDetailScreen({navigation, route}: Props) {
  const {albumId, albumName, ownerName, skipResumeImport} = route.params;
  const {shellProps, handleBack, handleBackPressIn} =
    useUploadAwareModalScreen(navigation, route.params.instant, {albumId});
  const {isMobileLayout, screenPaddingHorizontal} = useLayout();
  const isFocused = useIsFocused();
  const {resumeInFlightWork, startAnalysis} = useCulledAlbumActions();
  const [cullingActive, setCullingActive] = useState(false);

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

  const displayTotalPhotos = Math.max(totalPhotos, batchTotal);

  const cullingSnapshot = useCulledAlbumStore(state => {
    const album = state.albums[albumId];
    if (!album?.analysisBatchPhotoIds.length) {
      return {
        inProgress: false,
        complete: false,
        hasAnalyzed: false,
      };
    }

    let inProgress = false;
    let complete = true;
    let hasAnalyzed = false;

    for (const photoId of album.analysisBatchPhotoIds) {
      const photo = album.photos.find(entry => entry.photoId === photoId);
      if (!photo) {
        continue;
      }
      if (
        photo.analysisStatus === 'pending' ||
        photo.analysisStatus === 'analyzing'
      ) {
        inProgress = true;
        complete = false;
      }
      if (
        photo.analysisStatus !== 'analyzed' &&
        photo.analysisStatus !== 'failed'
      ) {
        complete = false;
      }
      if (photo.analysisStatus === 'analyzed') {
        hasAnalyzed = true;
      }
    }

    return {inProgress, complete, hasAnalyzed};
  });

  const isCullingInProgress =
    (cullingActive || cullingSnapshot.inProgress) && !cullingSnapshot.complete;

  useEffect(() => {
    if (cullingSnapshot.inProgress) {
      setCullingActive(true);
    }
  }, [cullingSnapshot.inProgress]);

  useEffect(() => {
    if (!isFocused || skipResumeImport) {
      return;
    }
    resumeInFlightWork(albumId);
  }, [albumId, isFocused, resumeInFlightWork, skipResumeImport]);

  useEffect(() => {
    if (!cullingActive || !cullingSnapshot.complete || cullingSnapshot.hasAnalyzed) {
      return;
    }
    setCullingActive(false);
  }, [cullingActive, cullingSnapshot.complete, cullingSnapshot.hasAnalyzed]);

  useEffect(() => {
    if (
      !isFocused ||
      !cullingActive ||
      !cullingSnapshot.complete ||
      !cullingSnapshot.hasAnalyzed
    ) {
      return;
    }
    navigation.replace('CulledAlbumDetail', {albumId});
  }, [
    albumId,
    cullingActive,
    cullingSnapshot.complete,
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

  return (
    <UploadAwareModalShell {...shellProps}>
      <SafeAreaView style={styles.container}>
      <View
        style={[
          styles.header,
          {paddingHorizontal: screenPaddingHorizontal},
          isMobileLayout && styles.headerMobile,
        ]}>
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
          isLocalImportActive={isUploading}
        />
      </View>
      <UploadToast mode="upload" albumId={albumId} />
      {isCullingInProgress ? (
        <UploadToast mode="analyze" albumId={albumId} />
      ) : null}
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
    paddingTop: 40,
    paddingBottom: 24,
    gap: 40,
  },
  headerMobile: {
    paddingTop: 16,
    gap: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontFamily: fonts.sansBold,
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
    lineHeight: 16,
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
    fontFamily: fonts.sansBold,
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
    fontFamily: fonts.sansBold,
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
