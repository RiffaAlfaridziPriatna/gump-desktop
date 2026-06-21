import {FaceStatusMeta} from '@lib/culling/faceStatus';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {StyleSheet, Text, View} from 'react-native';

export type KeyFaceTooltipAnchor = {
  centerX: number;
  bottomY: number;
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
}: {
  eyeMeta: FaceStatusMeta;
  focusMeta: FaceStatusMeta;
  backgroundColor?: string;
}) {
  return (
    <View style={styles.tooltipWrap}>
      <View
        style={[styles.tooltipPointer, {borderBottomColor: backgroundColor}]}
      />
      <View style={[styles.tooltip, {backgroundColor}]}>
        <StatusTooltipRow meta={eyeMeta} />
        <StatusTooltipRow meta={focusMeta} />
      </View>
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
    flexShrink: 0,
  },
  tooltipPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -1,
  },
});
