import {AlbumCard, AlbumGrid} from '@components/album';
import {UploadModal} from '@components/modals/UploadModal';
import {useAuthState} from '@context/auth';
import {useCulledAlbumList, filterAvailableSourceAlbums} from '@hooks/useCulledAlbumList';
import {useSiteAlbumList} from '@hooks/useSiteAlbumList';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {APIResponse, FileAsset} from '@services/api';
import {StackScreenProps} from '@react-navigation/stack';
import {useFocusEffect} from '@react-navigation/native';
import {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconChevronRight from '../assets/images/icon_chevron_right.svg';
import IconClose from '../assets/images/icon_close.svg';
import GumpLogo from '../assets/images/logo.svg';

type Props = StackScreenProps<MainStackParamList, 'SelectAlbum'>;

export default function SelectAlbumScreen({navigation}: Props) {
  const user = useAuthState(state => state.user);
  const {loadingAlbums, albums, loadMore, hasMore, refresh} = useSiteAlbumList();
  const {
    albums: culledAlbums,
    refresh: refreshCulledAlbums,
    addAlbum,
    createFromSiteAlbum,
  } = useCulledAlbumList();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<APIResponse.Album | null>(
    null,
  );
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshCulledAlbums();
    }, [refresh, refreshCulledAlbums]),
  );

  const emptyAlbums = useMemo(
    () =>
      filterAvailableSourceAlbums(albums.results, culledAlbums.results),
    [albums.results, culledAlbums.results],
  );

  const hasSelection = selectedIds.length > 0;

  function toggleSelection(albumId: string) {
    setSelectedIds(current =>
      current.includes(albumId)
        ? current.filter(id => id !== albumId)
        : [...current, albumId],
    );
  }

  function handleNext() {
    if (!hasSelection) return;
    const album =
      emptyAlbums.find(item => item.id === selectedIds[0]) ?? null;
    if (!album) return;
    setSelectedAlbum(album);
    setShowUploadModal(true);
  }

  async function handleFilesSelected(_files: FileAsset[]) {
    if (!selectedAlbum) return;
    setShowUploadModal(false);
    setCreatingAlbum(true);
    setCreateError(null);
    try {
      const album = await createFromSiteAlbum(selectedAlbum);
      addAlbum(album);
      navigation.reset({
        index: 0,
        routes: [{name: 'Home'}],
      });
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : 'Failed to create culling album',
      );
      setShowUploadModal(true);
    } finally {
      setCreatingAlbum(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <GumpLogo width={112} height={40} />
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          activeOpacity={0.7}
          disabled={creatingAlbum}>
          <IconClose width={32} height={32} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.titleRow}>
        <View style={styles.titleColumn}>
          <Text style={styles.title}>Select Your Album</Text>
          <Text style={styles.subtitle}>Showing albums with no photos yet.</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.nextButton,
            hasSelection ? styles.nextButtonEnabled : styles.nextButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={!hasSelection || creatingAlbum}
          activeOpacity={0.8}>
          <Text style={styles.nextText}>Next</Text>
          <IconChevronRight width={24} height={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      {creatingAlbum ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.creatingText}>Creating culling album...</Text>
        </View>
      ) : loadingAlbums && emptyAlbums.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
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
          <AlbumGrid columns={4} gap={12}>
            {emptyAlbums.map(album => (
              <AlbumCard
                key={album.id}
                variant="select"
                album={album}
                ownerName={user && user.role !== 'guest' ? user.name : undefined}
                isSelected={selectedIds.includes(album.id)}
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

      {createError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{createError}</Text>
        </View>
      )}

      <UploadModal
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSelect={handleFilesSelected}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingTop: 40,
    paddingBottom: 24,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 48,
    paddingTop: 20,
    gap: 10,
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
  nextText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.white,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 48,
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
  creatingText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
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
