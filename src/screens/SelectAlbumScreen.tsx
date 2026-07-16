import {AlbumCard, AlbumGrid} from '@components/album';
import {UploadModal} from '@components/modals/UploadModal';
import {UploadAwareModalShell} from '@components/navigation/UploadAwareModalShell';
import {useAuthState} from '@context/auth';
import {useCulledAlbumActions} from '@context/culledAlbum';
import {useLocalCulledAlbumList} from '@hooks/useLocalCulledAlbumList';
import {useSiteAlbumList} from '@hooks/useSiteAlbumList';
import {useLayout} from '@hooks/useLayout';
import {useUploadAwareModalScreen} from '@hooks/useUploadAwareModalScreen';
import {filterAvailableSourceAlbums} from '@lib/culledAlbum/selectAlbum';
import {registerLocalAlbum} from '@lib/culledAlbum/store';
import {uploadAwareParams} from '@lib/navigation/uploadAwareNavigation';
import {createCulledAlbumFromSelection} from '@lib/culledAlbum/types';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {APIResponse, FileAsset} from '@services/api';
import {StackScreenProps} from '@react-navigation/stack';
import {useFocusEffect} from '@react-navigation/native';
import {useCallback, useMemo, useRef, useState} from 'react';
import {TouchableOpacity} from '@components/ui';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconChevronRight from '../assets/images/icon_chevron_right.svg';
import IconClose from '../assets/images/icon_close.svg';
import GumpLogo from '../assets/images/logo.svg';

type Props = StackScreenProps<MainStackParamList, 'SelectAlbum'>;

export default function SelectAlbumScreen({navigation, route}: Props) {
  const {shellProps, handleBack, handleBackPressIn} = useUploadAwareModalScreen(
    navigation,
    route.params?.instant,
  );
  const user = useAuthState(state => state.user);
  const {
    isMobileLayout,
    screenPaddingHorizontal,
    albumGridColumns,
  } = useLayout();
  const {loadingAlbums, albums, loadMore, hasMore, refresh} = useSiteAlbumList();
  const {localAlbumIds, refresh: refreshLocalAlbums} = useLocalCulledAlbumList();
  const {addPhotos} = useCulledAlbumActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<APIResponse.Album | null>(
    null,
  );
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const isLeavingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (isLeavingRef.current) {
        return;
      }
      refresh();
      refreshLocalAlbums();
    }, [refresh, refreshLocalAlbums]),
  );

  const emptyAlbums = useMemo(
    () => filterAvailableSourceAlbums(albums.results, localAlbumIds),
    [albums.results, localAlbumIds],
  );

  const hasSelection = selectedId !== null;

  function toggleSelection(albumId: string) {
    setSelectedId(current => (current === albumId ? null : albumId));
  }

  function handleNext() {
    if (!selectedId) return;
    const album = emptyAlbums.find(item => item.id === selectedId) ?? null;
    if (!album) return;
    setSelectedAlbum(album);
    setShowUploadModal(true);
  }

  async function handleFilesSelected(files: FileAsset[]) {
    if (!selectedAlbum || files.length === 0) return;
    setShowUploadModal(false);
    setStarting(true);
    setStartError(null);
    try {
      const localAlbum = createCulledAlbumFromSelection(selectedAlbum);
      await registerLocalAlbum(localAlbum);
      addPhotos(localAlbum.albumId, files);
      isLeavingRef.current = true;
      navigation.replace(
        'AlbumDetail',
        uploadAwareParams({
          albumId: localAlbum.albumId,
          albumName: localAlbum.title ?? localAlbum.name,
          ownerName:
            user && user.role !== 'guest' ? user.name : selectedAlbum.name,
        }),
      );
    } catch (error) {
      setStarting(false);
      setStartError(
        error instanceof Error
          ? error.message
          : 'Failed to start culling session',
      );
      setShowUploadModal(true);
    }
  }

  return (
    <View style={styles.screen}>
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
          onPressIn={handleBackPressIn}
          onPress={handleBack}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          activeOpacity={0.7}
          disabled={starting}>
          <IconClose width={32} height={32} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.titleRow,
          {paddingHorizontal: screenPaddingHorizontal},
          isMobileLayout && styles.titleRowMobile,
        ]}>
        <View style={styles.titleColumn}>
          <Text style={styles.title}>Select Your Album</Text>
          <Text style={styles.subtitle}>Showing albums with no photos yet.</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.nextButton,
            hasSelection ? styles.nextButtonEnabled : styles.nextButtonDisabled,
            starting && styles.nextButtonLoading,
          ]}
          onPress={handleNext}
          disabled={!hasSelection || starting}
          activeOpacity={0.8}>
          <Text style={[styles.nextText, starting && styles.nextTextLoading]}>
            {starting ? 'Starting...' : 'Next'}
          </Text>
          <IconChevronRight
            width={24}
            height={24}
            color={starting ? colors.accent : colors.white}
          />
        </TouchableOpacity>
      </View>

      {loadingAlbums && emptyAlbums.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {paddingHorizontal: screenPaddingHorizontal},
          ]}
          scrollEnabled={!loadingAlbums}
          refreshControl={
            <RefreshControl
              refreshing={loadingAlbums}
              onRefresh={refresh}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          }
          onScroll={({nativeEvent}) => {
            const {layoutMeasurement, contentOffset, contentSize} = nativeEvent;
            const isNearBottom =
              layoutMeasurement.height + contentOffset.y >=
              contentSize.height - 120;
            if (isNearBottom && hasMore) {
              loadMore();
            }
          }}
          scrollEventThrottle={200}>
          <AlbumGrid columns={albumGridColumns} gap={12}>
            {emptyAlbums.map(album => (
              <AlbumCard
                key={album.id}
                variant="select"
                album={album}
                ownerName={user && user.role !== 'guest' ? user.name : undefined}
                isSelected={selectedId === album.id}
                onToggleSelect={() => toggleSelection(album.id)}
              />
            ))}
          </AlbumGrid>
          {!loadingAlbums && emptyAlbums.length === 0 && (
            <Text style={styles.emptyText}>
              No empty albums available. Create an album on the web app first.
            </Text>
          )}
        </ScrollView>
      )}

      {startError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{startError}</Text>
        </View>
      )}
    </SafeAreaView>
    </UploadAwareModalShell>

    <UploadModal
      visible={showUploadModal}
      onClose={() => setShowUploadModal(false)}
      onSelect={handleFilesSelected}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 24,
  },
  headerMobile: {
    paddingTop: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 20,
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
  nextButton: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingLeft: 32,
    paddingRight: 20,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonEnabled: {
    backgroundColor: colors.accent,
  },
  nextButtonDisabled: {
    opacity: 0.2,
  },
  nextButtonLoading: {
    backgroundColor: colors.accent + '14',
  },
  nextText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  nextTextLoading: {
    color: colors.accent,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 32,
    gap: 16,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 32,
    left: 24,
    right: 24,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
  },
});
