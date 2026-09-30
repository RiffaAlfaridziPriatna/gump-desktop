import {Badge} from '@components/ui';
import {useAlbumQueueOperation} from '@lib/culledAlbum/uploadQueueStore';
import {formatStorageSizeGb, LocalAlbumCardModel} from '@lib/culledAlbum/format';
import {
  getCachedImageDimensions,
  getCulledAlbumThumbnailLayout,
  loadImageDimensions,
} from '@lib/media/imageDimensions';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {APIResponse} from '@services/api';
import {TouchableOpacity} from '@components/ui';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import AlbumPlaceholder from '../../assets/images/album_placeholder.svg';
import IconCloud from '../../assets/images/icon_cloud.svg';
import IconMore from '../../assets/images/icon_more.svg';
import IconTrash from '../../assets/images/icon_trash.svg';
import {Checkbox} from '@components/ui';
import type {FrostedBackdrop} from '@components/ui/frosted';
import {useAlbumGridItemWidth} from './AlbumGrid';

const useNativeDriver = Platform.OS !== 'windows';

type AlbumCardAlbum = APIResponse.Album | LocalAlbumCardModel;

type AlbumCardBaseProps = {
  album: AlbumCardAlbum;
  ownerName?: string;
};

type HomepageAlbumCardProps = AlbumCardBaseProps & {
  variant: 'homepage';
  isExpanded?: boolean;
  mediaCount?: number;
  storageSizeGb?: number;
  onPress?: (albumId: string) => void;
  onPressMore?: (albumId: string) => void;
  onPressDelete?: (albumId: string) => void;
};

type SelectAlbumCardProps = AlbumCardBaseProps & {
  variant: 'select';
  isSelected?: boolean;
  onToggleSelect?: (albumId: string) => void;
};

export type AlbumCardProps = HomepageAlbumCardProps | SelectAlbumCardProps;

const COVER_HEIGHT = 220;

type CoverPreview = {
  url: string;
  width: number;
  height: number;
};

/** Prefer medium/small for list covers — large is detail-sized and costly to decode. */
function getListCoverPreview(album: AlbumCardAlbum): CoverPreview | null {
  const previewMap = album.cover?.preview;
  if (!previewMap) {
    return null;
  }

  const preview =
    previewMap.medium ??
    previewMap.small ??
    previewMap.large ??
    previewMap.optimized ??
    previewMap.thumbnail ??
    null;

  if (!preview?.url) {
    return null;
  }

  const width = preview.width || album.cover?.width || 0;
  const height = preview.height || album.cover?.height || 0;

  return {
    url: preview.url,
    width,
    height,
  };
}

function getListCoverUrl(album: AlbumCardAlbum): string | undefined {
  return getListCoverPreview(album)?.url;
}

const AlbumCover = memo(function AlbumCover({
  album,
  width,
}: {
  album: AlbumCardAlbum;
  width: number;
}) {
  const preview = getListCoverPreview(album);
  const coverUrl = preview?.url;
  const metadataWidth = preview?.width ?? 0;
  const metadataHeight = preview?.height ?? 0;
  const hasMetadataSize = metadataWidth > 0 && metadataHeight > 0;
  const cachedSize = !hasMetadataSize && coverUrl
    ? getCachedImageDimensions(coverUrl)
    : undefined;

  const [fetchedSize, setFetchedSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!coverUrl || hasMetadataSize || cachedSize) {
      setFetchedSize(null);
      return;
    }

    let cancelled = false;
    setFetchedSize(null);

    loadImageDimensions(coverUrl).then(dimensions => {
      if (!cancelled && dimensions) {
        setFetchedSize(dimensions);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cachedSize, coverUrl, hasMetadataSize]);

  const imageSize = hasMetadataSize
    ? {width: metadataWidth, height: metadataHeight}
    : cachedSize ?? fetchedSize;

  const imageLayout = useMemo(() => {
    if (!imageSize || width <= 0) {
      return null;
    }

    // Same cover/contain rules as CulledAlbumPhotoThumbnail grid cells.
    return getCulledAlbumThumbnailLayout(
      width,
      COVER_HEIGHT,
      imageSize.width,
      imageSize.height,
    );
  }, [imageSize, width]);

  if (coverUrl) {
    return (
      <View style={[styles.cover, {width}]}>
        {imageLayout ? (
          <Image
            source={{uri: coverUrl}}
            style={[
              styles.coverImage,
              {
                width: imageLayout.width,
                height: imageLayout.height,
                left: imageLayout.left,
                top: imageLayout.top,
              },
            ]}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.placeholder, {width}]}>
      <AlbumPlaceholder
        width={width}
        height={COVER_HEIGHT}
        preserveAspectRatio="xMidYMid slice"
      />
    </View>
  );
});

const SelectAlbumCard = memo(function SelectAlbumCard({
  album,
  ownerName,
  isSelected,
  onToggleSelect,
  itemWidth,
}: {
  album: AlbumCardAlbum;
  ownerName: string;
  isSelected?: boolean;
  onToggleSelect?: (albumId: string) => void;
  itemWidth: number;
}) {
  const handlePress = useCallback(() => {
    onToggleSelect?.(album.id);
  }, [album.id, onToggleSelect]);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      style={[
        styles.card,
        {width: itemWidth},
        isSelected && styles.cardSelected,
      ]}>
      <View style={styles.coverWrapper}>
        <AlbumCover album={album} width={itemWidth} />
        <View style={styles.checkbox}>
          <Checkbox checked={!!isSelected} onToggle={handlePress} />
        </View>
      </View>
      <View style={styles.footer}>
        <View>
          <Text style={styles.ownerName} numberOfLines={1}>
            {ownerName}
          </Text>
          <Text style={styles.albumTitle} numberOfLines={1}>
            {album.title ?? album.name}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const HomepageAlbumCard = memo(function HomepageAlbumCard({
  album,
  ownerName,
  isExpanded,
  mediaCount: mediaCountProp,
  storageSizeGb: storageSizeGbProp,
  onPress,
  onPressMore,
  onPressDelete,
  itemWidth,
}: {
  album: AlbumCardAlbum;
  ownerName: string;
  isExpanded?: boolean;
  mediaCount?: number;
  storageSizeGb?: number;
  onPress?: (albumId: string) => void;
  onPressMore?: (albumId: string) => void;
  onPressDelete?: (albumId: string) => void;
  itemWidth: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const localImportQueue = useAlbumQueueOperation(album.id, 'upload');
  const serverUploadQueue = useAlbumQueueOperation(album.id, 'serverUpload');
  const analysisQueue = useAlbumQueueOperation(album.id, 'analyze');
  const isUploading =
    localImportQueue.status === 'active' ||
    serverUploadQueue.status === 'active';
  const isAnalyzing =
    analysisQueue.status === 'active' || analysisQueue.status === 'finalizing';
  const isBusy = isUploading || isAnalyzing;
  const busyLabel = isAnalyzing
    ? 'Analyzing...'
    : isUploading
      ? 'Uploading...'
      : null;

  useEffect(() => {
    if (isExpanded) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [fadeAnim, isExpanded]);

  const showUploaded =
    'cullingHasUploads' in album && album.cullingHasUploads === true;
  const showCulled =
    'cullingCompleted' in album && album.cullingCompleted === true;
  const coverUrl = getListCoverUrl(album);
  const coverRef = useRef<View>(null);
  const [coverBackdrop, setCoverBackdrop] = useState<
    FrostedBackdrop | undefined
  >();

  const syncCoverBackdrop = useCallback(() => {
    coverRef.current?.measureInWindow((x, y, width, height) => {
      setCoverBackdrop({
        uri: coverUrl,
        coverWidth: width,
        coverHeight: height,
        coverX: x,
        coverY: y,
      });
    });
  }, [coverUrl]);

  const handlePress = useCallback(() => {
    onPress?.(album.id);
  }, [album.id, onPress]);

  const handlePressMore = useCallback(() => {
    onPressMore?.(album.id);
  }, [album.id, onPressMore]);

  const handlePressDelete = useCallback(() => {
    onPressDelete?.(album.id);
  }, [album.id, onPressDelete]);

  const mediaCount = mediaCountProp ?? album.totalMediaCount;
  const storageSizeGb = storageSizeGbProp ?? album.size;
  const CardWrapper = onPress ? TouchableOpacity : View;
  const cardWrapperProps = onPress
    ? {activeOpacity: 0.85, onPress: handlePress}
    : {};

  return (
    <CardWrapper
      {...cardWrapperProps}
      style={[
        styles.card,
        {width: itemWidth},
        isExpanded && styles.cardExpanded,
      ]}>
      <View
        ref={coverRef}
        style={styles.coverWrapper}
        onLayout={syncCoverBackdrop}>
        <AlbumCover album={album} width={itemWidth} />
        {busyLabel && (
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.analyzingText}>{busyLabel}</Text>
          </View>
        )}
        {(showUploaded || showCulled) && (
          <View style={styles.badges}>
            {showUploaded && (
              <Badge variant="uploaded" backdrop={coverBackdrop} />
            )}
            {showCulled && <Badge variant="culled" backdrop={coverBackdrop} />}
          </View>
        )}
      </View>
      <View style={[styles.footer, isExpanded && styles.footerExpanded]}>
        <View>
          <View style={[styles.infoRow, isExpanded && styles.infoRowExpanded]}>
            <Text style={styles.ownerName} numberOfLines={1}>
              {ownerName}
            </Text>
            <View style={styles.moreMenu}>
              <TouchableOpacity
                onPress={isBusy ? undefined : handlePressMore}
                disabled={isBusy}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                activeOpacity={0.7}>
                <IconMore
                  width={20}
                  height={20}
                  color={isExpanded ? colors.textDark : colors.iconMuted}
                />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.albumTitle} numberOfLines={1}>
            {album.title ?? album.name}
          </Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>
            Total <Text style={styles.statTextValue}>{mediaCount}</Text>
          </Text>
          <View style={styles.storageRow}>
            <IconCloud width={14} height={14} color={colors.textGray} />
            <Text style={styles.storageText}>
              {formatStorageSizeGb(storageSizeGb)}
            </Text>
          </View>
        </View>

        {isExpanded && !isBusy && (
          <Animated.View
            style={[styles.deletePopup, {opacity: fadeAnim}]}
            pointerEvents="box-none">
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handlePressDelete}
              activeOpacity={0.7}>
              <IconTrash width={20} height={20} color={colors.error} />
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </CardWrapper>
  );
});

export const AlbumCard = memo(function AlbumCard(props: AlbumCardProps) {
  const itemWidth = useAlbumGridItemWidth();
  const ownerName = props.ownerName ?? props.album.name;

  if (itemWidth <= 0) {
    return null;
  }

  if (props.variant === 'select') {
    return (
      <SelectAlbumCard
        album={props.album}
        ownerName={ownerName}
        isSelected={props.isSelected}
        onToggleSelect={props.onToggleSelect}
        itemWidth={itemWidth}
      />
    );
  }

  return (
    <HomepageAlbumCard
      album={props.album}
      ownerName={ownerName}
      isExpanded={props.isExpanded}
      mediaCount={props.mediaCount}
      storageSizeGb={props.storageSizeGb}
      onPress={props.onPress}
      onPressMore={props.onPressMore}
      onPressDelete={props.onPressDelete}
      itemWidth={itemWidth}
    />
  );
});

const styles = StyleSheet.create({
  cardSelected: {
    borderColor: colors.accent,
  },
  cover: {
    height: COVER_HEIGHT,
    overflow: 'hidden',
    backgroundColor: colors.cardBackgroundSecondary,
  },
  coverImage: {
    position: 'absolute',
  },
  placeholder: {
    height: COVER_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.cardBackground,
  },
  checkbox: {
    position: 'absolute',
    top: 12,
    right: 12,
  },

  card: {
    backgroundColor: colors.cardBackground,
    overflow: 'visible',
  },
  cardExpanded: {
    zIndex: 10,
    elevation: 10,
  },
  coverWrapper: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.cardBackground,
  },
  badges: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    zIndex: 5,
  },
  analyzingText: {
    ...sansBoldStyle,
    fontSize: 12,
    color: colors.white,
  },

  footer: {
    position: 'relative',
    backgroundColor: colors.cardBackground,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
    overflow: 'visible',
  },
  footerExpanded: {
    zIndex: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoRowExpanded: {
    zIndex: 1,
  },
  moreMenu: {
    position: 'relative',
  },
  deletePopup: {
    position: 'absolute',
    top: 32,
    right: 16,
    zIndex: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ownerName: {
    fontFamily: fonts.serif,
    fontSize: 18,
    lineHeight: 18 * 1.2,
    letterSpacing: 0.5,
    color: colors.textDark,
  },
  albumTitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    color: colors.textDark,
  },

  statText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 12 * 1.2,
    letterSpacing: 0,
    color: colors.textDark,
  },
  storageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  storageText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 12 * 1.2,
    letterSpacing: 0,
    color: colors.textGray,
    paddingTop: 2,
  },
  statTextValue: {
    fontWeight: 'bold',
  },

  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.background,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
    minWidth: 80,
  },
  deleteText: {
    ...sansBoldStyle,
    fontSize: 12,
    lineHeight: 12 * 1.2,
    letterSpacing: 0,
    color: colors.error,
  },
});
