import {PhotoMasonryGrid} from '@components/photo/PhotoMasonryGrid';
import {
  useCullingAnalyzerActions,
  useCullingAnalyzerState,
} from '@context/cullingAnalyzer';
import {useUploaderActions, useUploaderState} from '@context/uploader';
import {useCulledAlbumPhotos} from '@hooks/useCulledAlbumPhotos';
import {markCullingStarted} from '@lib/cullingStarted';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconChevronLeft from '../assets/images/icon_chevron_left.svg';
import IconScissors from '../assets/images/icon_scissors.svg';
import GumpLogo from '../assets/images/logo.svg';

type Props = StackScreenProps<MainStackParamList, 'AlbumDetail'>;

export default function AlbumDetailScreen({navigation, route}: Props) {
  const {albumId, albumName, ownerName, files} = route.params;
  const uploads = useUploaderState(state => state.uploads);
  const {addItems} = useUploaderActions();
  const analyzeItems = useCullingAnalyzerState(state => state.items);
  const {startAnalysis} = useCullingAnalyzerActions();
  const startedRef = useRef(false);
  const [cullingActive, setCullingActive] = useState(false);
  const {photos, loadingPhotos, loadError, reloadPhotos} =
    useCulledAlbumPhotos(albumId);

  const albumUploads = useMemo(
    () => uploads.filter(item => item.albumId === albumId),
    [albumId, uploads],
  );

  const albumAnalyzeItems = useMemo(
    () => analyzeItems.filter(item => item.albumId === albumId),
    [albumId, analyzeItems],
  );

  const isAnalysisComplete =
    albumAnalyzeItems.length > 0 &&
    albumAnalyzeItems.every(
      item => item.status === 'analyzed' || item.status === 'failed',
    );

  const hasAnalyzedPhotos = albumAnalyzeItems.some(
    item => item.status === 'analyzed',
  );

  const isUploading = albumUploads.some(
    item => item.status === 'pending' || item.status === 'uploading',
  );
  const uploadedCount = albumUploads.filter(
    item => item.status === 'uploaded',
  ).length;
  const displayPhotos = useMemo(() => {
    if (albumUploads.length > 0) {
      return albumUploads
        .filter(item => item.status === 'uploaded' && item.localFile)
        .map(item => item.localFile!);
    }
    return photos;
  }, [albumUploads, photos]);

  const placeholderCount = useMemo(
    () =>
      albumUploads.filter(
        item => item.status === 'pending' || item.status === 'uploading',
      ).length,
    [albumUploads],
  );

  const totalPhotos =
    albumUploads.length > 0 ? albumUploads.length : photos.length;
  const isCullingInProgress = cullingActive && !isAnalysisComplete;

  useEffect(() => {
    if (files && files.length > 0 && !startedRef.current) {
      startedRef.current = true;
      addItems(files, albumId);
    }
  }, [addItems, albumId, files]);

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
    if (!cullingActive || !isAnalysisComplete || !hasAnalyzedPhotos) {
      return;
    }
    navigation.replace('CulledAlbumDetail', {
      albumId,
      albumName,
      ownerName,
    });
  }, [
    albumId,
    albumName,
    cullingActive,
    hasAnalyzedPhotos,
    isAnalysisComplete,
    navigation,
    ownerName,
  ]);

  async function handleStartCulling() {
    if (displayPhotos.length === 0 || isUploading || cullingActive) {
      return;
    }
    setCullingActive(true);
    await markCullingStarted(albumId);
    startAnalysis(albumId, displayPhotos);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <GumpLogo width={112} height={40} />
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate('Home')}
          activeOpacity={0.7}>
          <IconChevronLeft width={24} height={24} color={colors.accent} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.titleRow}>
        <View style={styles.titleColumn}>
          <Text style={styles.title}>{ownerName}</Text>
          <Text style={styles.subtitle}>{albumName}</Text>
        </View>
        <View style={styles.actionsColumn}>
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

      {loadingPhotos && photos.length === 0 && albumUploads.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : loadError ? (
        <View style={styles.loading}>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      ) : (
        <PhotoMasonryGrid
          items={displayPhotos}
          placeholderCount={Math.min(placeholderCount, 12)}
        />
      )}
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
    paddingHorizontal: 48,
    paddingTop: 40,
    paddingBottom: 24,
    gap: 40,
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
    paddingHorizontal: 48,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 10,
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
    paddingHorizontal: 48,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
