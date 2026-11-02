import {FaceCropAvatar} from '@components/culling/FaceCropAvatar';
import {Pressable} from '@components/ui';
import type {EyeStatus, FocusLevel} from '@domain/valueObjects/Face';
import {useFaceAssessmentLoading} from '@hooks/useFaceAssessmentLoading';
import {cullingStatusColors} from '@lib/culling/faceStatus';
import {
  getFacePanelStatus,
  isValidFaceAssessment,
} from '@lib/culling/facePanelStatus';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import React, {useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import IconChevronDown from '../../assets/images/icon_chevron_down.svg';
import IconChevronUp from '../../assets/images/icon_chevron_up.svg';

export const FACES_EMPTY_HINT =
  'Choose Inspect faces on a photo to check eyes and sharpness here.';
const TITLE = 'Faces in This Photo';
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
        <ActivityIndicator size="small" color={colors.white} />
        <Text style={styles.stateText}>Loading face assessment…</Text>
      </View>
    );
  }
  if (photo.faces.length === 0) {
    return <Text style={styles.stateText}>No faces detected.</Text>;
  }
  if (!photo.faces.every(isValidFaceAssessment)) {
    return <Text style={styles.stateText}>Face assessment unavailable.</Text>;
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

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={TITLE}
        accessibilityState={{expanded}}
        onPress={() => setExpanded(value => !value)}
        style={styles.header}>
        <Chevron width={16} height={16} color={colors.white} />
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
          <PanelBody photo={photo} loading={loading} />
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
