import {ProgressBar} from '@components/ui';
import {bytesToGigabytes} from '@lib/culledAlbum/format';
import {formatGigabytes} from '@lib/export/formatByteSize';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';

const TRACK = '#ECECEC';
const DIVIDER = '#EBEBEB';

/** Whole-GB limits print without a decimal ("300 GB"), others like the usage rows. */
export function formatLimit(limitBytes: number): string {
  const gb = bytesToGigabytes(limitBytes);
  return Number.isInteger(gb) ? `${gb} GB` : formatGigabytes(limitBytes);
}

function percentOf(bytes: number, limitBytes: number): number {
  return limitBytes > 0 ? Math.min(1, Math.max(0, bytes / limitBytes)) : 0;
}

function StorageBar({
  label,
  progress,
  height,
  fillColor,
}: {
  label: string;
  progress: number;
  height: number;
  fillColor: string;
}) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}, percent of limit`}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(progress * 100),
      }}>
      <ProgressBar
        progress={progress}
        height={height}
        trackColor={TRACK}
        fillColor={fillColor}
        style={styles.bar}
      />
    </View>
  );
}

type Row = {label: string; value: string; valueColor?: string};

function StorageRow({label, value, valueColor}: Row) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor ? {color: valueColor} : null]}>
        {value}
      </Text>
    </View>
  );
}

type CloudStorageCardProps = {
  uploadBytes: number;
  usedBytes: number;
  /** null = unlimited plan: no "/ limit", no bar */
  limitBytes: number | null;
  afterBytes: number;
  exceeded?: boolean;
};

export function CloudStorageCard({
  uploadBytes,
  usedBytes,
  limitBytes,
  afterBytes,
  exceeded = false,
}: CloudStorageCardProps) {
  const suffix = limitBytes == null ? '' : ` / ${formatLimit(limitBytes)}`;
  const afterText = `${formatGigabytes(afterBytes)}${suffix}`;
  const accent = exceeded ? colors.red : colors.accent;

  return (
    <View style={styles.card}>
      <StorageRow label="This upload" value={formatGigabytes(uploadBytes)} />
      <StorageRow
        label="Cloud storage used"
        value={`${formatGigabytes(usedBytes)}${suffix}`}
      />
      <View style={styles.divider} />
      <StorageRow
        label="Storage after upload"
        value={afterText}
        valueColor={exceeded ? colors.red : undefined}
      />
      {limitBytes == null ? null : (
        <StorageBar
          label="Storage after upload"
          progress={exceeded ? 1 : percentOf(afterBytes, limitBytes)}
          height={9}
          fillColor={accent}
        />
      )}
    </View>
  );
}

/** Upload complete card: "Storage used 121.0 / 300 GB" from a fresh refetch. */
export function UsedStorageCard({
  usedBytes,
  limitBytes,
}: {
  usedBytes: number;
  limitBytes: number | null;
}) {
  const used = formatGigabytes(usedBytes);
  const valueText =
    limitBytes == null
      ? used
      : `${used.replace(/ GB$/, '')} / ${formatLimit(limitBytes)}`;

  return (
    <View style={styles.card}>
      <StorageRow label="Storage used" value={valueText} />
      {limitBytes == null ? null : (
        <StorageBar
          label="Storage used"
          progress={percentOf(usedBytes, limitBytes)}
          height={6}
          fillColor={colors.accent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 24,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.2,
    color: colors.textMuted,
  },
  value: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.2,
    color: colors.textDark,
    fontWeight: '600',
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
  },
  bar: {
    borderRadius: 3,
  },
});
