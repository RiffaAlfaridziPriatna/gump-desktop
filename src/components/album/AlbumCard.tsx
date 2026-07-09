import {Badge} from '@components/ui';
import {formatStorageSizeGb, LocalAlbumCardModel} from '@lib/culledAlbum/format';
import {
  getCoverImageLayout,
  loadImageDimensions,
} from '@lib/media/imageDimensions';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {APIResponse} from '@services/api';
import {TouchableOpacity} from '@components/ui';
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
  onPress?: () => void;
  onPressMore?: () => void;
  onPressDelete?: () => void;
};

type SelectAlbumCardProps = AlbumCardBaseProps & {
  variant: 'select';
  isSelected?: boolean;
  onToggleSelect?: () => void;
};

export type AlbumCardProps = HomepageAlbumCardProps | SelectAlbumCardProps;

const COVER_HEIGHT = 200;

function AlbumCover({album, width}: {album: AlbumCardAlbum; width: number}) {
  const coverUrl = album.cover?.preview?.large?.url;
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!coverUrl) {
      return;
    }

    let cancelled = false;
    setImageSize(null);

    loadImageDimensions(coverUrl).then(dimensions => {
      if (!cancelled && dimensions) {
        setImageSize(dimensions);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  const imageLayout = useMemo(() => {
    if (!imageSize) {
      return null;
    }

    return getCoverImageLayout(
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
}

export function AlbumCard(props: AlbumCardProps) {
  const itemWidth = useAlbumGridItemWidth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const ownerName = props.ownerName ?? props.album.name;

  useEffect(() => {
    if (props.variant === 'homepage' && props.isExpanded) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [fadeAnim, props]);

  if (itemWidth <= 0) {
    return null;
  }

  if (props.variant === 'select') {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={props.onToggleSelect}
        style={[
          styles.card,
          {width: itemWidth},
          props.isSelected && styles.cardSelected,
        ]}>
        <View style={styles.coverWrapper}>
          <AlbumCover album={props.album} width={itemWidth} />
          <View style={styles.checkbox}>
            <Checkbox
              checked={!!props.isSelected}
              onToggle={() => props.onToggleSelect?.()}
            />
          </View>
        </View>
        <View style={styles.footer}>
          <View>
            <Text style={styles.ownerName} numberOfLines={1}>
              {ownerName}
            </Text>
            <Text style={styles.albumTitle} numberOfLines={1}>
              {props.album.title ?? props.album.name}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const showUploaded =
    'cullingHasUploads' in props.album && props.album.cullingHasUploads === true;
  const showCulled =
    'cullingCompleted' in props.album && props.album.cullingCompleted === true;
  const coverUrl = props.album.cover?.preview?.large?.url;
  const coverRef = useRef<View>(null);
  const [coverBackdrop, setCoverBackdrop] = useState<FrostedBackdrop | undefined>();

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

  const mediaCount = props.mediaCount ?? props.album.totalMediaCount;
  const storageSizeGb = props.storageSizeGb ?? props.album.size;
  const CardWrapper = props.onPress ? TouchableOpacity : View;
  const cardWrapperProps = props.onPress
    ? {activeOpacity: 0.85, onPress: props.onPress}
    : {};

  return (
    <CardWrapper
      {...cardWrapperProps}
      style={[
        styles.card,
        {width: itemWidth},
        props.isExpanded && styles.cardExpanded,
      ]}>
      <View ref={coverRef} style={styles.coverWrapper} onLayout={syncCoverBackdrop}>
        <AlbumCover album={props.album} width={itemWidth} />
        {(showUploaded || showCulled) && (
          <View style={styles.badges}>
            {showUploaded && (
              <Badge variant="uploaded" backdrop={coverBackdrop} />
            )}
            {showCulled && <Badge variant="culled" backdrop={coverBackdrop} />}
          </View>
        )}
      </View>
      <View
        style={[
          styles.footer,
          props.isExpanded && styles.footerExpanded,
        ]}>
        <View>
          <View
            style={[
              styles.infoRow,
              props.isExpanded && styles.infoRowExpanded,
            ]}>
            <Text style={styles.ownerName} numberOfLines={1}>
              {ownerName}
            </Text>
            <View style={styles.moreMenu}>
              <TouchableOpacity
                onPress={props.onPressMore}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                activeOpacity={0.7}>
                <IconMore
                  width={20}
                  height={20}
                  color={
                    props.isExpanded ? colors.textDark : colors.iconMuted
                  }
                />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.albumTitle} numberOfLines={1}>
            {props.album.title ?? props.album.name}
          </Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>
            Total{' '}
            <Text style={styles.statTextValue}>{mediaCount}</Text>
          </Text>
          <View style={styles.storageRow}>
            <IconCloud width={14} height={14} color={colors.textGray} />
            <Text style={styles.storageText}>
              {formatStorageSizeGb(storageSizeGb)}
            </Text>
          </View>
        </View>

        {props.isExpanded && (
          <Animated.View
            style={[styles.deletePopup, {opacity: fadeAnim}]}
            pointerEvents="box-none">
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={props.onPressDelete}
              activeOpacity={0.7}>
              <IconTrash width={20} height={20} color={colors.error} />
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </CardWrapper>
  );
}

const styles = StyleSheet.create({
  cardSelected: {
    borderColor: colors.accent,
  },
  cover: {
    height: COVER_HEIGHT,
    overflow: 'hidden',
  },
  coverImage: {
    position: 'absolute',
  },
  placeholder: {
    height: COVER_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
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
    backgroundColor: colors.cardBackground
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
    marginTop: 8,
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
    fontFamily: fonts.sansBold,
    fontSize: 12,
    lineHeight: 12 * 1.2,
    letterSpacing: 0,
    color: colors.error,
  },
});
