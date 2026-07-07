import {PhotoMasonryGrid} from '@components/photo/PhotoMasonryGrid';
import {UploadToast} from '@components/upload/UploadToast';
import {
  useCulledAlbumActions,
  useCulledAlbumLocalImportProgress,
  useCulledAlbumPhotosState,
  useCulledAlbumStore,
} from '@context/culledAlbum';
import {useCulledAlbumPhotos} from '@hooks/useCulledAlbumPhotos';
import {useThrottledValue} from '@hooks/useThrottledValue';
import {useUploadAwareModalScreen} from '@hooks/useUploadAwareModalScreen';
import {useLayout} from '@hooks/useLayout';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useIsFocused} from '@react-navigation/native';
import {useEffect, useMemo, useState} from 'react';
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

const GRID_UPDATE_THROTTLE_MS = 300;

type Props = StackScreenProps<MainStackParamList, 'AlbumDetail'>;

type AlbumDetailBodyProps = {
  albumId: string;
  screenPaddingHorizontal: number;
  skipInitialLoad: boolean;
};

function AlbumDetailBody({
  albumId,
  screenPaddingHorizontal,
  skipInitialLoad,
}: AlbumDetailBodyProps) {
  const albumPhotos = useCulledAlbumPhotosState(albumId);
  const {photos, loadingPhotos, loadError, reloadPhotos} = useCulledAlbumPhotos(
    albumId,
    {skipInitialLoad: skipInitialLoad || albumPhotos.length > 0},
  );

  const isUploading = albumPhotos.some(
    photo => photo.status === 'pending' || photo.status === 'uploading',
  );
  const uploadedCount = albumPhotos.filter(
    photo => photo.status === 'uploaded',
  ).length;

  const displayPhotos = useMemo(() => {
    const uploaded = albumPhotos
      .filter(photo => photo.status === 'uploaded')
      .map(photo => photo.file);
    if (uploaded.length > 0) {
      return uploaded;
    }
    return photos;
  }, [albumPhotos, photos]);

  const placeholderCount = useMemo(
    () =>
      albumPhotos.filter(
        photo => photo.status === 'pending' || photo.status === 'uploading',
      ).length,
    [albumPhotos],
  );

  const throttledDisplayPhotos = useThrottledValue(
    displayPhotos,
    GRID_UPDATE_THROTTLE_MS,
  );
  const throttledPlaceholderCount = useThrottledValue(
    placeholderCount,
    GRID_UPDATE_THROTTLE_MS,
  );

  useEffect(() => {
    if (!isUploading && uploadedCount > 0) {
      reloadPhotos();
    }
  }, [isUploading, reloadPhotos, uploadedCount]);

  if (loadingPhotos && photos.length === 0 && albumPhotos.length === 0) {
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
    <>
      <PhotoMasonryGrid
        items={throttledDisplayPhotos}
        placeholderCount={Math.min(throttledPlaceholderCount, 12)}
        horizontalPadding={screenPaddingHorizontal}
      />
      <UploadToast mode="upload" albumId={albumId} />
      <UploadToast mode="analyze" albumId={albumId} />
    </>
  );
}

export default function AlbumDetailScreen({navigation, route}: Props) {
  useUploadAwareModalScreen(navigation, route.params.instant);
  const {albumId, albumName, ownerName, skipResumeImport} = route.params;
  const {isMobileLayout, screenPaddingHorizontal} = useLayout();
  const isFocused = useIsFocused();
  const {resumeLocalImport, startAnalysis} = useCulledAlbumActions();
  const [cullingActive, setCullingActive] = useState(false);

  const localImportProgress = useCulledAlbumLocalImportProgress(albumId);
  const totalPhotos = useCulledAlbumStore(
    state => state.albums[albumId]?.totalPhotos ?? 0,
  );

  const isUploading =
    (localImportProgress?.pending ?? 0) + (localImportProgress?.uploading ?? 0) >
    0;
  const hasUploadedPhotos =
    (localImportProgress?.uploaded ?? 0) > 0 ||
    (!isUploading && totalPhotos > 0);

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

  const displayTotalPhotos = totalPhotos;

  useEffect(() => {
    if (cullingSnapshot.inProgress) {
      setCullingActive(true);
    }
  }, [cullingSnapshot.inProgress]);

  useEffect(() => {
    if (skipResumeImport) {
      return;
    }
    resumeLocalImport(albumId);
  }, [albumId, resumeLocalImport, skipResumeImport]);

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
          onPress={() => navigation.goBack()}
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

      <AlbumDetailBody
        albumId={albumId}
        screenPaddingHorizontal={screenPaddingHorizontal}
        skipInitialLoad={totalPhotos > 0}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
