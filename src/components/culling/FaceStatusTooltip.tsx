import {FaceStatusMeta} from '@lib/culling/faceStatus';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';

export type FaceStatusTooltipPlacement = 'above' | 'below';

export type KeyFaceTooltipAnchor = {
  centerX: number;
  bottomY: number;
  /** Top edge of the hover target; used when placement is `above`. */
  topY?: number;
  placement?: FaceStatusTooltipPlacement;
  eyeMeta: FaceStatusMeta;
  focusMeta: FaceStatusMeta;
  backgroundColor?: string;
};

function StatusTooltipRow({meta}: {meta: FaceStatusMeta}) {
  const {Icon, label} = meta;

  return (
    <View style={styles.tooltipRow}>
      <Icon width={10} height={10} />
      <Text style={styles.tooltipLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function FaceStatusTooltip({
  eyeMeta,
  focusMeta,
  backgroundColor = colors.divider + 'E5',
  placement = 'below',
}: {
  eyeMeta: FaceStatusMeta;
  focusMeta: FaceStatusMeta;
  backgroundColor?: string;
  placement?: FaceStatusTooltipPlacement;
}) {
  const pointer =
    placement === 'above' ? (
      <View
        style={[styles.tooltipPointerDown, {borderTopColor: backgroundColor}]}
      />
    ) : (
      <View
        style={[styles.tooltipPointerUp, {borderBottomColor: backgroundColor}]}
      />
    );

  return (
    <View style={styles.tooltipWrap}>
      {placement === 'below' ? pointer : null}
      <View style={[styles.tooltip, {backgroundColor}]}>
        <StatusTooltipRow meta={eyeMeta} />
        <StatusTooltipRow meta={focusMeta} />
      </View>
      {placement === 'above' ? pointer : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltipWrap: {
    alignItems: 'center',
  },
  tooltip: {
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 4,
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  tooltipLabel: {
    fontFamily: fonts.sans,
    fontSize: 10,
    lineHeight: 14,
    color: colors.text,
    flexShrink: 0,
  },
  tooltipPointerUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -1,
  },
  tooltipPointerDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
});
