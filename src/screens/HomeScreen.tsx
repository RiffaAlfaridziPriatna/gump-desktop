import {AlbumCard, AlbumGrid} from '@components/album';
import {DeleteAlbumModal} from '@components/modals/DeleteAlbumModal';
import {useAuthState} from '@context/auth';
import {useLocalCulledAlbumList} from '@hooks/useLocalCulledAlbumList';
import {useDeleteCulledAlbum} from '@hooks/useDeleteCulledAlbum';
import {useLayout} from '@hooks/useLayout';
import {toAlbumCardModel} from '@lib/culledAlbum/format';
import {navigateToCulledAlbum} from '@lib/culledAlbum/navigateToCulledAlbum';
import {CulledAlbumListItem} from '@lib/culledAlbum/types';
import {
  uploadAwareRouteParams,
  shouldDeferHeavyWorkForNavigation,
} from '@lib/navigation/uploadAwareNavigation';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useFocusEffect} from '@react-navigation/native';
import {useCallback, useMemo, useState} from 'react';
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
import ImageCheckIcon from '../assets/images/image_check.svg';
import IconChevronRight from '../assets/images/icon_chevron_right.svg';
import GumpLogo from '../assets/images/logo.svg';

type Props = StackScreenProps<MainStackParamList, 'Home'>;

export default function HomeScreen({navigation}: Props) {
  const user = useAuthState(state => state.user);
  const {loadingAlbums, albums, refresh, count} = useLocalCulledAlbumList();
  const deleteCulledAlbum = useDeleteCulledAlbum();
  const {
    isMobileLayout,
    screenPaddingHorizontal,
    albumGridColumns,
  } = useLayout();

  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [albumToDelete, setAlbumToDelete] = useState<CulledAlbumListItem | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const cardModels = useMemo(
    () => albums.map(album => toAlbumCardModel(album)),
    [albums],
  );
  const hasAlbums = albums.length > 0;

  useFocusEffect(
    useCallback(() => {
      if (shouldDeferHeavyWorkForNavigation()) {
        const timer = setTimeout(() => {
          refresh();
        }, 400);
        return () => clearTimeout(timer);
      }

      refresh();
    }, [refresh]),
  );

  async function handlePressAlbum(album: CulledAlbumListItem) {
    if (expandedCardId !== null) {
      setExpandedCardId(null);
    }

    navigateToCulledAlbum(
      navigation,
      album,
      user && user.role !== 'guest' ? user.name : album.name,
    );
  }

  function handlePressMore(albumId: string) {
    setExpandedCardId(current => (current === albumId ? null : albumId));
  }

  async function handleDeleteAlbum() {
    if (!albumToDelete) {
      return;
    }

    const album = albumToDelete;
    setAlbumToDelete(null);
    setExpandedCardId(null);

    void deleteCulledAlbum(album).catch(error => {
      console.error('[HomeScreen] Failed to delete album', error);
      void refresh();
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={[
          styles.header,
          {paddingHorizontal: screenPaddingHorizontal},
          isMobileLayout && styles.headerMobile,
        ]}
        onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
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
          <View
            style={[
              styles.titleRow,
              {paddingHorizontal: screenPaddingHorizontal},
              isMobileLayout && styles.titleRowMobile,
            ]}>
            <View style={styles.titleColumn}>
              <View style={styles.titleLine}>
                <Text style={styles.title}>Album</Text>
                {!loadingAlbums && (
                  <Text style={styles.count}> ({count})</Text>
                )}
              </View>
              <Text style={styles.subtitle}>Recently Added Albums</Text>
            </View>
            <TouchableOpacity
              style={styles.cullingButton}
              onPress={() =>
                navigation.navigate('SelectAlbum', uploadAwareRouteParams())
              }
              activeOpacity={0.8}>
              <Text style={styles.cullingButtonText}>Start New Culling</Text>
              <IconChevronRight width={24} height={24} color={colors.white} />
            </TouchableOpacity>
          </View>

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
            scrollEventThrottle={200}>
            <AlbumGrid columns={albumGridColumns} gap={16}>
              {albums.map((album, index) => (
                <AlbumCard
                  key={album.albumId}
                  variant="homepage"
                  album={cardModels[index]!}
                  ownerName={user && user.role !== 'guest' ? user.name : undefined}
                  isExpanded={expandedCardId === album.albumId}
                  onPress={() => handlePressAlbum(album)}
                  onPressMore={() => handlePressMore(album.albumId)}
                  onPressDelete={() => setAlbumToDelete(album)}
                />
              ))}
            </AlbumGrid>
          </ScrollView>
        </>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.emptyScrollContent,
            {paddingHorizontal: screenPaddingHorizontal},
          ]}
          refreshControl={
            <RefreshControl
              refreshing={loadingAlbums}
              onRefresh={refresh}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          }
          scrollEventThrottle={200}>
          <View
            style={[
              styles.emptyState,
              headerHeight > 0 && {paddingBottom: headerHeight},
            ]}>
            <View style={styles.emptyContent}>
              <Text style={styles.emptyTitle}>Clean Up Your Photo Albums</Text>
              <Text style={styles.emptySubtitle}>
                Select an existing album to start culling your photos.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.emptyCard}
              onPress={() =>
                navigation.navigate('SelectAlbum', uploadAwareRouteParams())
              }
              activeOpacity={0.7}>
              <ImageCheckIcon width={40} height={40} color={colors.accent} />
              <Text style={styles.emptyCardLabel}>Select Existing Album</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      <DeleteAlbumModal
        visible={albumToDelete !== null}
        album={albumToDelete}
        onClose={() => setAlbumToDelete(null)}
        onDelete={handleDeleteAlbum}
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
  breadcrumbContainer: {
    gap: 8,
  },
  breadcrumbText: {
    ...sansBoldStyle,
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
    paddingTop: 32,
  },
  titleRowMobile: {
    flexDirection: 'column',
    gap: 16,
    paddingTop: 16,
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
    ...sansBoldStyle,
    fontSize: 14,
    color: colors.white,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 24,
  },
  emptyScrollContent: {
    flexGrow: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    ...sansBoldStyle,
    fontSize: 16,
    lineHeight: 16 * 1.4,
    color: colors.text,
  },
});
