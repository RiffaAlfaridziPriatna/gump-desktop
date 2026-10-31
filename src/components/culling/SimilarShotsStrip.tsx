import {CulledAlbumPhotoThumbnail} from '@components/culling/CulledAlbumPhotoThumbnail';
import {Pressable} from '@components/ui';
import {useCulledAlbumPhoto} from '@context/culledAlbum';
import {useSimilarShotGroups} from '@hooks/useSimilarShotGroups';
import {isCulledPhotoDisabled} from '@lib/culledAlbum/types';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {resolveGridDisplayUri} from '@lib/storage/localStorage';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import IconCheckCircle from '../../assets/images/icon_check_circle.svg';
import IconCheckCircleOutlined from '../../assets/images/icon_check_circle_outlined.svg';

const THUMBNAIL_WIDTH = 96;

type SimilarShotsStripProps = {
  albumId: string;
  photoId: string;
  onOpenPhoto: (photoId: string) => void;
};

type MemberProps = SimilarShotsStripProps & {memberId: string};

function SimilarShotMember({
  albumId,
  photoId,
  memberId,
  onOpenPhoto,
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
        <CulledAlbumPhotoThumbnail
          albumId={albumId}
          photoId={memberId}
          width={THUMBNAIL_WIDTH}
          uri={resolveGridDisplayUri(member.file) ?? ''}
          thumbnailWidth={member.file.thumbnailWidth}
          thumbnailHeight={member.file.thumbnailHeight}
        />
      </Pressable>
      <Pressable
        onPress={() =>
          cullingEngine.updateSelection(albumId, memberId, {selected: !picked})
        }
        disabled={disabled}
        style={styles.pickButton}
        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
        focusable
        accessibilityRole="checkbox"
        accessibilityLabel={`Pick ${name}`}
        accessibilityState={{checked: picked, disabled}}
      >
        {picked ? (
          <IconCheckCircle width={20} height={20} color={colors.text} />
        ) : (
          <IconCheckCircleOutlined width={20} height={20} color={colors.text} />
        )}
      </Pressable>
      {member.aiSelected ? (
        <View
          style={styles.aiBadge}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={styles.aiBadgeText}>AI recommended</Text>
        </View>
      ) : null}
    </View>
  );
}

export function SimilarShotsStrip({
  albumId,
  photoId,
  onOpenPhoto,
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
      <Text
        style={styles.title}
        accessibilityRole="header"
        accessibilityLabel={`Similar shots, ${summary.shotCount} photos, ${summary.pickedCount} picked`}
      >
        {`Similar shots · ${summary.shotCount} photos · ${summary.pickedCount} picked`}
      </Text>
      <ScrollView horizontal contentContainerStyle={styles.row}>
        {group.photoIds.map(memberId => (
          <SimilarShotMember
            key={memberId}
            albumId={albumId}
            photoId={photoId}
            memberId={memberId}
            onOpenPhoto={onOpenPhoto}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {gap: 8, paddingTop: 12},
  title: {
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  row: {gap: 8},
  member: {borderWidth: 2, borderColor: 'transparent', borderRadius: 4},
  memberCurrent: {borderColor: colors.accent},
  pickButton: {position: 'absolute', top: 4, right: 4},
  aiBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    borderRadius: 100,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: colors.badge,
  },
  aiBadgeText: {
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textDark,
  },
});
