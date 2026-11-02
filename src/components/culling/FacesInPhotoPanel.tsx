import {FaceCropAvatar} from '@components/culling/FaceCropAvatar';
import {Pressable} from '@components/ui';
import type {EyeStatus, FocusLevel} from '@domain/valueObjects/Face';
import {useFaceAssessmentLoading} from '@hooks/useFaceAssessmentLoading';
import {cullingStatusColors} from '@lib/culling/faceStatus';
import {
  areAllFacesInvalid,
  getFacePanelStatus,
} from '@lib/culling/facePanelStatus';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import React, {useEffect, useState} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import IconChevronDown from '../../assets/images/icon_chevron_down.svg';
import IconChevronUp from '../../assets/images/icon_chevron_up.svg';
import IconScanFace from '../../assets/images/lucide_scan_face.svg';

export const FACES_EMPTY_HINT =
  'Choose Inspect faces on a photo to check eyes and sharpness here.';
const TITLE = 'Faces in This Photo';
const NO_FACES_TEXT = 'No faces detected.';
const UNAVAILABLE_TEXT = 'Face assessment unavailable.';
const CROP_SIZE = 48;

export type FacesInPhotoPanelFace = {
  faceId: string;
  bounds: {left: number; top: number; width: number; height: number};
  eyeStatus: EyeStatus;
  focusLevel: FocusLevel;
};

export type FacesInPhotoPanelPhoto = {
  photoId: string;
  fileName: string;
  /** Source image for face crops. */
  uri?: string;
  faces: readonly FacesInPhotoPanelFace[];
};

type FacesInPhotoPanelProps = {
  /** The focused photo, or null when nothing is focused. */
  photo: FacesInPhotoPanelPhoto | null;
};

function FaceItem({
  face,
  uri,
}: {
  face: FacesInPhotoPanelFace;
  uri?: string;
}) {
  const status = getFacePanelStatus(face);
  const a11yLabel = status.labels.map(l => l.text).join(', ');
  const EyeIcon = status.kind === 'assessed' ? status.eyeMeta?.Icon : null;
  const showBang =
    status.kind === 'assessed' && !EyeIcon && status.focusWarning;
  const badgeColor =
    status.kind === 'unknown'
      ? colors.textMuted
      : EyeIcon || showBang
        ? cullingStatusColors.warning
        : null;

  return (
    <View accessible accessibilityLabel={a11yLabel} style={styles.face}>
      <View style={styles.crop}>
        <FaceCropAvatar uri={uri} boundingBox={face.bounds} size={CROP_SIZE} />
      </View>
      {badgeColor ? (
        <View
          pointerEvents="none"
          style={[styles.badge, {backgroundColor: badgeColor}]}>
          {EyeIcon ? (
            <EyeIcon width={10} height={10} />
          ) : (
            <Text
              style={[
                styles.badgeText,
                status.kind === 'unknown' && styles.badgeTextUnknown,
              ]}>
              {status.kind === 'unknown' ? '?' : '!'}
            </Text>
          )}
        </View>
      ) : null}
      {status.labels.map(label => (
        <Text
          key={label.text}
          style={[styles.faceLabel, label.warning && styles.faceLabelWarning]}>
          {label.text}
        </Text>
      ))}
    </View>
  );
}

function facesCountText(count: number): string {
  return `${count} ${count === 1 ? 'face' : 'faces'}`;
}

function getAnnouncement(photo: FacesInPhotoPanelPhoto): string {
  if (photo.faces.length === 0) {
    return NO_FACES_TEXT;
  }
  if (areAllFacesInvalid(photo.faces)) {
    return UNAVAILABLE_TEXT;
  }
  return facesCountText(photo.faces.length);
}

function PanelBody({
  photo,
  loading,
}: {
  photo: FacesInPhotoPanelPhoto | null;
  loading: boolean;
}) {
  if (!photo) {
    return <Text style={styles.hint}>{FACES_EMPTY_HINT}</Text>;
  }
  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator
          accessible={false}
          size="small"
          color={colors.white}
        />
        <Text style={styles.stateText}>Loading face assessment…</Text>
      </View>
    );
  }
  if (photo.faces.length === 0) {
    return <Text style={styles.stateText}>{NO_FACES_TEXT}</Text>;
  }
  if (areAllFacesInvalid(photo.faces)) {
    return <Text style={styles.stateText}>{UNAVAILABLE_TEXT}</Text>;
  }
  return (
    <View style={styles.grid}>
      {photo.faces.map((face, index) => (
        <FaceItem
          key={`${face.faceId}-${index}`}
          face={face}
          uri={photo.uri}
        />
      ))}
    </View>
  );
}

export function FacesInPhotoPanel({photo}: FacesInPhotoPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const loading = useFaceAssessmentLoading(photo?.photoId ?? null);
  const Chevron = expanded ? IconChevronUp : IconChevronDown;
  const count = photo && photo.faces.length > 0 ? photo.faces.length : null;
  const announcement = photo && !loading ? getAnnouncement(photo) : null;

  // macOS has no live regions; announce once per settled focus, not on collapse.
  useEffect(() => {
    if (announcement) {
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [announcement, photo?.photoId]);

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          count ? `${TITLE}, ${facesCountText(count)}` : TITLE
        }
        accessibilityState={{expanded}}
        onPress={() => setExpanded(value => !value)}
        style={styles.header}>
        <Chevron width={16} height={16} color={colors.white} />
        <IconScanFace width={16} height={16} color={colors.white} />
        <Text style={styles.title}>
          {count ? `${TITLE} · ${count}` : TITLE}
        </Text>
      </Pressable>
      {expanded ? (
        <>
          {photo ? (
            <Text numberOfLines={1} style={styles.fileName}>
              {photo.fileName}
            </Text>
          ) : null}
          <View accessibilityLiveRegion="polite">
            <PanelBody photo={photo} loading={loading} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {paddingHorizontal: 12, gap: 10},
  header: {flexDirection: 'row', alignItems: 'center', gap: 6},
  // Inter Semi Bold is not bundled; closest existing bold is Red Hat Display.
  title: {...sansBoldStyle, fontSize: 16, color: colors.white},
  fileName: {fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted},
  hint: {fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted},
  stateText: {fontFamily: fonts.sans, fontSize: 13, color: colors.white},
  loadingRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 12},
  face: {width: 66, alignItems: 'center', gap: 4},
  crop: {width: CROP_SIZE, height: CROP_SIZE},
  badge: {
    position: 'absolute',
    left: 42,
    top: 33,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#131415',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {...sansBoldStyle, fontSize: 12, color: '#131415'},
  badgeTextUnknown: {fontSize: 11, color: colors.white},
  faceLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    textAlign: 'center',
    color: colors.textMuted,
  },
  faceLabelWarning: {
    ...sansBoldStyle,
    color: cullingStatusColors.warning,
  },
});
