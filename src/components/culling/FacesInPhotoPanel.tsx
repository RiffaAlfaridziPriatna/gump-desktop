import {FaceCropAvatar} from '@components/culling/FaceCropAvatar';
import {ShowAiMarkersToggle} from '@components/culling/ShowAiMarkersToggle';
import {Pressable} from '@components/ui';
import type {EyeStatus, FocusLevel} from '@domain/valueObjects/Face';
import {useFaceAssessmentLoading} from '@hooks/useFaceAssessmentLoading';
import {cullingStatusColors} from '@lib/culling/faceStatus';
import {
  areAllFacesInvalid,
  getFacePanelStatus,
} from '@lib/culling/facePanelStatus';
import {colors} from '@lib/ui/colors';
import {fonts, interSemiBoldStyle, sansBoldStyle} from '@lib/ui/typography';
import React, {useEffect, useState} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import IconBadgeEyes from '../../assets/images/icon_face_badge_eyes.svg';
import IconChevronDown from '../../assets/images/lucide_chevron_down.svg';
import IconChevronUp from '../../assets/images/lucide_chevron_up.svg';
import IconScanFace from '../../assets/images/lucide_scan_face.svg';

export const FACES_EMPTY_HINT =
  'Choose Inspect faces on a photo to check eyes and sharpness here.';
const TITLE = 'Faces in This Photo';
const NO_FACES_TEXT = 'No faces detected.';
const UNAVAILABLE_TEXT = 'Face assessment unavailable.';
const CROP_SIZE = 48;
const VIEWER_CROP_SIZE = 64;
/** Viewer face tile (crop + label). Two rows + gap = default body height. */
export const VIEWER_FACE_HEIGHT = 82;
export const VIEWER_FACE_ROW_GAP = 16;
export const VIEWER_FACES_PER_ROW = 4;
/** Default body under the filename: 2 rows × 82 + 16 gap. */
export const VIEWER_FACES_BODY_MIN_HEIGHT =
  VIEWER_FACE_HEIGHT * 2 + VIEWER_FACE_ROW_GAP;

export function viewerFacesBodyHeight(faceCount: number): number {
  if (faceCount <= VIEWER_FACES_PER_ROW * 2) {
    return VIEWER_FACES_BODY_MIN_HEIGHT;
  }
  const rows = Math.ceil(faceCount / VIEWER_FACES_PER_ROW);
  return rows * VIEWER_FACE_HEIGHT + (rows - 1) * VIEWER_FACE_ROW_GAP;
}

export type FacesInPhotoPanelVariant = 'sidebar' | 'viewer';

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
  /** `viewer` is the wide, non-collapsible panel beside the photo viewer. */
  variant?: FacesInPhotoPanelVariant;
  /** Viewer only: tap a face to zoom to it; tapping the selected face again is the caller's toggle. */
  onFacePress?: (index: number) => void;
  selectedIndex?: number | null;
  /** Viewer only: whether face markers overlay the photo. */
  showAiMarkers?: boolean;
  /** Viewer only: toggle for `showAiMarkers`. */
  onShowAiMarkersChange?: (next: boolean) => void;
};

function FaceItem({
  face,
  uri,
  viewer,
  selected,
  onPress,
}: {
  face: FacesInPhotoPanelFace;
  uri?: string;
  viewer: boolean;
  selected: boolean;
  onPress?: () => void;
}) {
  const cropSize = viewer ? VIEWER_CROP_SIZE : CROP_SIZE;
  const status = getFacePanelStatus(face);
  const shownLabel = status.labels.find(l => l.warning) ?? status.labels[0];
  const a11yLabel = shownLabel.text;
  const showEyes = status.kind === 'assessed' && status.eyeMeta !== null;
  const showBang =
    status.kind === 'assessed' && !showEyes && status.focusWarning;
  const badgeColor =
    status.kind === 'unknown'
      ? colors.textMuted
      : showEyes || showBang
        ? cullingStatusColors.warning
        : null;

  const Wrapper = onPress ? Pressable : View;
  const wrapperProps = onPress
    ? {
        accessibilityRole: 'button' as const,
        accessibilityHint: 'Zoom to this face',
        accessibilityState: {selected},
        onPress,
      }
    : {};

  return (
    <Wrapper
      accessible
      accessibilityLabel={a11yLabel}
      {...wrapperProps}
      style={[styles.face, viewer && styles.faceViewer]}>
      <View
        style={[
          {width: cropSize, height: cropSize},
          selected && styles.cropSelected,
        ]}>
        <FaceCropAvatar uri={uri} boundingBox={face.bounds} size={cropSize} />
      </View>
      {badgeColor ? (
        <View
          pointerEvents="none"
          style={[
            styles.badge,
            viewer && styles.badgeViewer,
            {backgroundColor: badgeColor},
          ]}>
          {showEyes ? (
            <IconBadgeEyes width={10} height={10} />
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
      <Text
        style={[
          styles.faceLabel,
          shownLabel.warning && styles.faceLabelWarning,
        ]}>
        {shownLabel.text}
      </Text>
    </Wrapper>
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

function IssueSummary({photo}: {photo: FacesInPhotoPanelPhoto}) {
  const counts = new Map<string, number>();
  for (const face of photo.faces) {
    for (const label of getFacePanelStatus(face).labels) {
      if (label.warning) {
        counts.set(label.text, (counts.get(label.text) ?? 0) + 1);
      }
    }
  }
  if (counts.size === 0) {
    return null;
  }
  return (
    <View style={styles.summary}>
      {[...counts].map(([text, count]) => (
        <View key={text} style={styles.chip}>
          <Text style={styles.chipText}>{`${text} · ${count}`}</Text>
        </View>
      ))}
    </View>
  );
}

function PanelBody({
  photo,
  loading,
  viewer,
  selectedIndex,
  onFacePress,
}: {
  photo: FacesInPhotoPanelPhoto | null;
  loading: boolean;
  viewer: boolean;
  selectedIndex: number | null;
  onFacePress?: (index: number) => void;
}) {
  const bodyHeight =
    viewer && photo
      ? loading
        ? VIEWER_FACES_BODY_MIN_HEIGHT
        : viewerFacesBodyHeight(photo.faces.length)
      : undefined;
  const bodyStyle = bodyHeight !== undefined ? {minHeight: bodyHeight} : null;

  if (!photo) {
    return <Text style={styles.hint}>{FACES_EMPTY_HINT}</Text>;
  }
  if (loading) {
    return (
      <View style={[styles.loadingRow, bodyStyle]}>
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
    return (
      <View style={bodyStyle}>
        <Text style={styles.stateText}>{NO_FACES_TEXT}</Text>
      </View>
    );
  }
  if (areAllFacesInvalid(photo.faces)) {
    return (
      <View style={bodyStyle}>
        <Text style={styles.stateText}>{UNAVAILABLE_TEXT}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.grid, viewer && styles.gridViewer, bodyStyle]}>
      {photo.faces.map((face, index) => (
        <FaceItem
          key={`${face.faceId}-${index}`}
          face={face}
          uri={photo.uri}
          viewer={viewer}
          selected={selectedIndex === index}
          onPress={onFacePress ? () => onFacePress(index) : undefined}
        />
      ))}
    </View>
  );
}

export function FacesInPhotoPanel({
  photo,
  variant = 'sidebar',
  onFacePress,
  selectedIndex = null,
  showAiMarkers = true,
  onShowAiMarkersChange,
}: FacesInPhotoPanelProps) {
  const viewer = variant === 'viewer';
  const [collapsed, setCollapsed] = useState(false);
  const expanded = viewer || !collapsed;
  const loading = useFaceAssessmentLoading(photo?.photoId ?? null);
  const Chevron = expanded ? IconChevronUp : IconChevronDown;
  const count = photo && photo.faces.length > 0 ? photo.faces.length : null;
  const announcement = photo && !loading ? getAnnouncement(photo) : null;
  const showMarkersToggle =
    viewer && onShowAiMarkersChange !== undefined;

  // macOS has no live regions; announce once per settled focus, not on collapse.
  useEffect(() => {
    if (announcement) {
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [announcement, photo?.photoId]);

  return (
    <View style={[styles.root, viewer && styles.rootViewer]}>
      {viewer ? (
        <View style={styles.header}>
          <IconScanFace width={16} height={16} color={colors.white} />
          <Text style={styles.title}>
            {count ? `${TITLE} · ${count}` : TITLE}
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            count ? `${TITLE}, ${facesCountText(count)}` : TITLE
          }
          accessibilityState={{expanded}}
          onPress={() => setCollapsed(value => !value)}
          style={styles.header}>
          <Chevron width={16} height={16} color={colors.white} />
          <IconScanFace width={16} height={16} color={colors.white} />
          <Text style={styles.title}>
            {count ? `${TITLE} · ${count}` : TITLE}
          </Text>
        </Pressable>
      )}
      {expanded ? (
        <>
          {photo ? (
            <Text numberOfLines={1} style={styles.fileName}>
              {photo.fileName}
            </Text>
          ) : null}
          {viewer && photo && !loading ? <IssueSummary photo={photo} /> : null}
          <View accessibilityLiveRegion="polite">
            <PanelBody
              photo={photo}
              loading={loading}
              viewer={viewer}
              selectedIndex={selectedIndex}
              onFacePress={viewer ? onFacePress : undefined}
            />
          </View>
          {showMarkersToggle ? (
            <>
              <View style={styles.markersDivider} />
              <ShowAiMarkersToggle
                value={showAiMarkers}
                onChange={onShowAiMarkersChange}
              />
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {paddingHorizontal: 12, gap: 10},
  rootViewer: {paddingHorizontal: 0, gap: 14},
  header: {flexDirection: 'row', alignItems: 'center', gap: 6},
  title: {...interSemiBoldStyle, fontSize: 16, color: colors.white},
  fileName: {fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted},
  hint: {fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted},
  stateText: {fontFamily: fonts.sans, fontSize: 13, color: colors.white},
  loadingRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 12},
  gridViewer: {
    // Column gap stays 12 (Figma); row gap is 16 so 2×82 + 16 = 180.
    rowGap: VIEWER_FACE_ROW_GAP,
    columnGap: 12,
    gap: undefined,
  },
  face: {width: 66, alignItems: 'center', gap: 4},
  faceViewer: {width: 73, height: VIEWER_FACE_HEIGHT},
  cropSelected: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.white,
  },
  summary: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    backgroundColor: '#242424',
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    ...interSemiBoldStyle,
    fontSize: 12,
    color: cullingStatusColors.warning,
  },
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
  badgeViewer: {left: 53.5, top: 49},
  badgeText: {...sansBoldStyle, fontSize: 12, color: '#131415'},
  badgeTextUnknown: {fontSize: 11, color: colors.white},
  faceLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    textAlign: 'center',
    color: colors.textMuted,
  },
  faceLabelWarning: {
    ...interSemiBoldStyle,
    color: cullingStatusColors.warning,
  },
  markersDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginTop: 4,
  },
});
