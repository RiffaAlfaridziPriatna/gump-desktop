import {PhotoMasonryGrid} from '@components/photo/PhotoMasonryGrid';
import {UploadToast} from '@components/upload/UploadToast';
import {
  useCulledAlbumActions,
  useCulledAlbumPhotosState,
} from '@context/culledAlbum';
import {useCulledAlbumPhotos} from '@hooks/useCulledAlbumPhotos';
import {useLayout} from '@hooks/useLayout';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useIsFocused} from '@react-navigation/native';
import {useEffect, useMemo, useRef, useState} from 'react';
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

export default function AlbumDetailScreen({navigation, route}: Props) {
  const {albumId, albumName, ownerName, files} = route.params;
  const {isMobileLayout, screenPaddingHorizontal} = useLayout();
  const isFocused = useIsFocused();
  const albumPhotos = useCulledAlbumPhotosState(albumId);
  const {addPhotos, resumeLocalImport, startAnalysis} = useCulledAlbumActions();
  const startedRef = useRef(false);
  const [cullingActive, setCullingActive] = useState(false);
  const {photos, loadingPhotos, loadError, reloadPhotos} =
    useCulledAlbumPhotos(albumId, {skipInitialLoad: Boolean(files?.length)});

  const isUploading = albumPhotos.some(
    photo => photo.status === 'pending' || photo.status === 'uploading',
  );
  const uploadedCount = albumPhotos.filter(
    photo => photo.status === 'uploaded',
  ).length;
  const analyzePhotos = useMemo(
    () => albumPhotos.filter(photo => photo.analysisStatus !== 'idle'),
    [albumPhotos],
  );
  const isAnalysisComplete =
    analyzePhotos.length > 0 &&
    analyzePhotos.every(
      photo =>
        photo.analysisStatus === 'analyzed' ||
        photo.analysisStatus === 'failed',
    );
  const hasAnalyzedPhotos = analyzePhotos.some(
    photo => photo.analysisStatus === 'analyzed',
  );

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

  const totalPhotos =
    albumPhotos.length > 0 ? albumPhotos.length : photos.length;
  const isAnalysisInProgress = albumPhotos.some(
    photo =>
      photo.analysisStatus === 'pending' || photo.analysisStatus === 'analyzing',
  );
  const isCullingInProgress =
    (cullingActive || isAnalysisInProgress) && !isAnalysisComplete;

  useEffect(() => {
    if (isAnalysisInProgress) {
      setCullingActive(true);
    }
  }, [isAnalysisInProgress]);

  useEffect(() => {
    if (files && files.length > 0 && !startedRef.current) {
      startedRef.current = true;
      addPhotos(albumId, files);
    }
  }, [addPhotos, albumId, files]);

  useEffect(() => {
    resumeLocalImport(albumId);
  }, [albumId, resumeLocalImport]);

  useEffect(() => {
    if (!isUploading && uploadedCount > 0) {
      reloadPhotos();
    }
  }, [isUploading, reloadPhotos, uploadedCount]);

  useEffect(() => {
    if (!cullingActive || !isAnalysisComplete || hasAnalyzedPhotos) {
      return;
    }
    setCullingActive(false);
  }, [cullingActive, hasAnalyzedPhotos, isAnalysisComplete]);

  useEffect(() => {
    if (
      !isFocused ||
      !cullingActive ||
      !isAnalysisComplete ||
      !hasAnalyzedPhotos
    ) {
      return;
    }
    navigation.replace('CulledAlbumDetail', {albumId});
  }, [
    albumId,
    cullingActive,
    hasAnalyzedPhotos,
    isAnalysisComplete,
    isFocused,
    navigation,
  ]);

  async function handleStartCulling() {
    if (displayPhotos.length === 0 || isUploading || cullingActive) {
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
            <Text style={styles.totalPhotosValue}>{totalPhotos}</Text>
          </Text>
          <TouchableOpacity
            style={[
              styles.cullingButton,
              isCullingInProgress && styles.cullingButtonInProgress,
              (isUploading || displayPhotos.length === 0 || cullingActive) &&
                !isCullingInProgress &&
                styles.cullingButtonDisabled,
            ]}
            disabled={
              isUploading ||
              displayPhotos.length === 0 ||
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

      {loadingPhotos && photos.length === 0 && albumPhotos.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : loadError ? (
        <View style={styles.loading}>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      ) : isFocused ? (
        <PhotoMasonryGrid
          items={displayPhotos}
          placeholderCount={Math.min(placeholderCount, 12)}
          horizontalPadding={screenPaddingHorizontal}
        />
      ) : null}
      <UploadToast mode="upload" albumId={albumId} />
      <UploadToast mode="analyze" albumId={albumId} />
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
