import {AlbumCard, AlbumGrid} from '@components/album';
import {DeleteAlbumModal} from '@components/modals/DeleteAlbumModal';
import {useAuthState} from '@context/auth';
import {useCulledAlbumList} from '@hooks/useCulledAlbumList';
import {useCulledAlbumLocalStats} from '@hooks/useCulledAlbumLocalStats';
import {removePhotosByAlbum} from '@lib/culledAlbumLocal';
import {deleteLocalAlbumFiles} from '@lib/localStorage';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {APIResponse} from '@services/api';
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
import ImageCheckIcon from '../assets/images/image_check.svg';
import IconChevronRight from '../assets/images/icon_chevron_right.svg';
import GumpLogo from '../assets/images/logo.svg';

type Props = StackScreenProps<MainStackParamList, 'Home'>;

export default function HomeScreen({navigation}: Props) {
  const user = useAuthState(state => state.user);
  const {loadingAlbums, albums, loadMore, hasMore, removeAlbum, refresh} =
    useCulledAlbumList();

  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [albumToDelete, setAlbumToDelete] =
    useState<APIResponse.CulledAlbum | null>(null);
  const albumIds = useMemo(
    () => albums.results.map(album => album.id),
    [albums.results],
  );
  const {counts: localCounts, sizesGb: localSizesGb} =
    useCulledAlbumLocalStats(albumIds);
  const hasAlbums = albums.results.length > 0;

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  function handlePressAlbum(album: APIResponse.CulledAlbum) {
    if (expandedCardId === album.id) {
      return;
    }
    navigation.navigate('AlbumDetail', {
      albumId: album.id,
      albumName: album.title ?? album.name,
      ownerName: user && user.role !== 'guest' ? user.name : album.name,
    });
  }

  function handlePressMore(albumId: string) {
    setExpandedCardId(current => (current === albumId ? null : albumId));
  }

  async function handleDeleted() {
    if (!albumToDelete) return;
    const albumId = albumToDelete.id;
    try {
      await Promise.all([
        removePhotosByAlbum(albumId),
        deleteLocalAlbumFiles(albumId),
      ]);
    } catch (error) {
      console.error('[HomeScreen] Failed to delete local album files', error);
    }
    removeAlbum(albumId);
    setExpandedCardId(null);
    setAlbumToDelete(null);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <GumpLogo width={112} height={40} />
        {hasAlbums && (
          <View style={styles.breadcrumbContainer}>
            <Text style={styles.breadcrumbText}>Album</Text>
            <View style={styles.breadcrumbUnderline} />
          </View>
        )}
      </View>

      {loadingAlbums && !hasAlbums ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : hasAlbums ? (
        <>
          <View style={styles.titleRow}>
            <View style={styles.titleColumn}>
              <View style={styles.titleLine}>
                <Text style={styles.title}>Album</Text>
                {!loadingAlbums && (
                  <Text style={styles.count}> ({albums.count})</Text>
                )}
              </View>
              <Text style={styles.subtitle}>Recently Added Albums</Text>
            </View>
            <TouchableOpacity
              style={styles.cullingButton}
              onPress={() => navigation.navigate('SelectAlbum')}
              activeOpacity={0.8}>
              <Text style={styles.cullingButtonText}>Start New Culling</Text>
              <IconChevronRight width={24} height={24} color={colors.white} />
            </TouchableOpacity>
          </View>

          {loadingAlbums && albums.results.length === 0 ? (
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
                const {layoutMeasurement, contentOffset, contentSize} =
                  nativeEvent;
                const isNearBottom =
                  layoutMeasurement.height + contentOffset.y >=
                  contentSize.height - 120;
                if (isNearBottom && hasMore) {
                  loadMore();
                }
              }}
              scrollEventThrottle={200}>
              <AlbumGrid columns={4} gap={16}>
                {albums.results.map(album => (
                  <AlbumCard
                    key={album.id}
                    variant="homepage"
                    album={album}
                    ownerName={user && user.role !== 'guest' ? user.name : undefined}
                    mediaCount={localCounts[album.id] ?? album.totalMediaCount}
                    storageSizeGb={
                      localSizesGb[album.id] > 0
                        ? localSizesGb[album.id]
                        : album.size
                    }
                    isExpanded={expandedCardId === album.id}
                    onPress={() => handlePressAlbum(album)}
                    onPressMore={() => handlePressMore(album.id)}
                    onPressDelete={() => setAlbumToDelete(album)}
                  />
                ))}
              </AlbumGrid>
              {loadingAlbums && albums.results.length > 0 && (
                <ActivityIndicator
                  style={styles.loadMore}
                  color={colors.accent}
                />
              )}
            </ScrollView>
          )}
        </>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={loadingAlbums}
              onRefresh={refresh}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          }
          scrollEventThrottle={200}>
          <View style={[styles.emptyState, {paddingTop: 40}]}>
            <View style={styles.emptyContent}>
              <Text style={styles.emptyTitle}>Clean Up Your Photo Albums</Text>
              <Text style={styles.emptySubtitle}>
                Select an existing album to start culling your photos.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.emptyCard}
              onPress={() => navigation.navigate('SelectAlbum')}
              activeOpacity={0.7}>
              <ImageCheckIcon width={40} height={40} />
              <Text style={styles.emptyCardLabel}>Select Existing Album</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      <DeleteAlbumModal
        visible={albumToDelete !== null}
        album={albumToDelete}
        onClose={() => setAlbumToDelete(null)}
        onDeleted={handleDeleted}
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
    paddingHorizontal: 48,
    paddingTop: 40,
    paddingBottom: 24,
    gap: 40,
  },
  breadcrumbContainer: {
    gap: 8,
  },
  breadcrumbText: {
    fontFamily: fonts.sansBold,
    fontSize: 20,
    lineHeight: 20 * 1.2,
    letterSpacing: 1.5,
    color: colors.accent,
  },
  breadcrumbUnderline: {
    width: '100%',
    height: 4,
    backgroundColor: colors.accent,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 48,
    paddingTop: 32,
  },
  titleColumn: {
    gap: 8,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 42,
    lineHeight: 42 * 1.2,
    letterSpacing: 0,
    color: colors.text,
  },
  count: {
    fontFamily: fonts.sans,
    fontSize: 20,
    lineHeight: 20 * 1.2,
    letterSpacing: 1.5,
    fontWeight: 700,
    color: colors.textMuted,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 16,
    color: colors.text,
  },
  cullingButton: {
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
  cullingButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.white,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 24,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadMore: {
    marginTop: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 40,
  },
  emptyContent: {
    gap: 16,
  },
  emptyTitle: {
    fontFamily: fonts.serif,
    fontSize: 32,
    color: colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 16,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: 300,
    paddingVertical: 80,
    paddingHorizontal: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  emptyCardLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    lineHeight: 16 * 1.4,
    color: colors.text,
  },
});
