import {CulledAlbumPhotoThumbnail} from '@components/culling/CulledAlbumPhotoThumbnail';
import {Pressable} from '@components/ui';
import {useCulledAlbumPhoto} from '@context/culledAlbum';
import {useSimilarShotGroups} from '@hooks/useSimilarShotGroups';
import {isCulledPhotoDisabled} from '@lib/culledAlbum/types';
import {reportError} from '@lib/observability/reportError';
import {resolveGridDisplayUri} from '@lib/storage/localStorage';
import {colors} from '@lib/ui/colors';
import {fonts, interSemiBoldStyle} from '@lib/ui/typography';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import IconCheck from '../../assets/images/lucide_check.svg';
import IconLayers from '../../assets/images/lucide_layers.svg';
import IconSparkles from '../../assets/images/lucide_sparkles.svg';

const THUMBNAIL_WIDTH = 134;

type SimilarShotsStripProps = {
  albumId: string;
  photoId: string;
  onOpenPhoto: (photoId: string) => void;
  onToggleSelection: (photoId: string, selected: boolean) => Promise<unknown>;
};

type MemberProps = SimilarShotsStripProps & {memberId: string};

function SimilarShotMember({
  albumId,
  photoId,
  memberId,
  onOpenPhoto,
  onToggleSelection,
}: MemberProps) {
  const member = useCulledAlbumPhoto(albumId, memberId);
  if (!member) {
    return null;
  }
  const isCurrent = memberId === photoId;
  const picked = member.selected;
  const disabled = isCulledPhotoDisabled(member);
  const name = member.file.name;

  return (
    <View style={[styles.member, isCurrent && styles.memberCurrent]}>
      <Pressable
        onPress={() => onOpenPhoto(memberId)}
        accessibilityRole="button"
        focusable
        accessibilityLabel={`Open ${name}, ${picked ? 'picked' : 'not picked'}${member.aiSelected ? ', AI recommended' : ''}${isCurrent ? ', current photo' : ''}`}
        accessibilityState={{selected: isCurrent}}
      >
        <View style={styles.image}>
          <CulledAlbumPhotoThumbnail
            albumId={albumId}
            photoId={memberId}
            width={THUMBNAIL_WIDTH}
            uri={resolveGridDisplayUri(member.file) ?? ''}
            thumbnailWidth={member.file.thumbnailWidth}
            thumbnailHeight={member.file.thumbnailHeight}
          />
          {member.aiSelected ? (
            <View
              style={styles.aiBadge}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.aiBadgeIcon}>
                <IconSparkles width={10.6724} height={10.6724} color={colors.white} />
              </View>
              <Text style={styles.aiBadgeText}>AI recommended</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            onToggleSelection(memberId, !picked).catch(err =>
              reportError(err, {
                source: 'similar_shots_strip',
                operation: 'toggle_pick',
              }),
            );
          }}
          disabled={disabled}
          style={styles.pickButton}
          focusable
          accessibilityRole="checkbox"
          accessibilityLabel={`Pick ${name}`}
          accessibilityState={{checked: picked, disabled}}
        >
          <View style={[styles.pickCircle, picked && styles.pickCirclePicked]}>
            {picked ? (
              <IconCheck width={11} height={11} color={colors.white} />
            ) : null}
          </View>
        </Pressable>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </View>
  );
}

export function SimilarShotsStrip({
  albumId,
  photoId,
  onOpenPhoto,
  onToggleSelection,
}: SimilarShotsStripProps) {
  const {orderedGroups, groupIndexByPhotoId, summaryFor} =
    useSimilarShotGroups(albumId);
  const groupIndex = groupIndexByPhotoId.get(photoId);
  const group =
    groupIndex === undefined ? undefined : orderedGroups[groupIndex];
  const summary = groupIndex === undefined ? undefined : summaryFor(groupIndex);
  if (!group || !summary) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={styles.titleIcon}>
          <IconLayers width={14.2344} height={14.2223} color={colors.white} />
        </View>
        <Text
          style={styles.title}
          accessibilityRole="header"
          accessibilityLabel={`Similar shots, ${summary.shotCount} photos, ${summary.pickedCount} picked`}
        >
          {`Similar shots · ${summary.shotCount} photos · ${summary.pickedCount} picked`}
        </Text>
      </View>
      <ScrollView horizontal contentContainerStyle={styles.row}>
        {group.photoIds.map(memberId => (
          <SimilarShotMember
            key={memberId}
            albumId={albumId}
            photoId={photoId}
            memberId={memberId}
            onOpenPhoto={onOpenPhoto}
            onToggleSelection={onToggleSelection}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {gap: 10, paddingTop: 12},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  titleIcon: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...interSemiBoldStyle,
    fontSize: 14,
    color: colors.text,
  },
  row: {gap: 12},
  // Figma insets content 3 px from the card edge: 1 padding + 2 border, so
  // the current-card border overlays the inset without moving the image.
  member: {
    width: 140,
    padding: 1,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 8,
    gap: 6,
  },
  memberCurrent: {borderColor: colors.blue},
  image: {
    width: THUMBNAIL_WIDTH,
    height: 89,
    borderRadius: 6,
    overflow: 'hidden',
  },
  footer: {flexDirection: 'row', alignItems: 'center', gap: 4, height: 24},
  pickButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickCirclePicked: {backgroundColor: colors.accent, borderWidth: 0},
  name: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.text,
  },
  aiBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 100,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.blue,
  },
  aiBadgeIcon: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBadgeText: {
    ...interSemiBoldStyle,
    fontSize: 12,
    color: colors.white,
  },
});
