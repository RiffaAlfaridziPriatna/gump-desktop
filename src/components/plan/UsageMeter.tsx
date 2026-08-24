import {ProgressBar} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';

type UsageMeterProps = {
  label: string;
  valueLabel: string;
  progress: number;
  fillColor?: string;
  height?: number;
  footer?: string;
  compact?: boolean;
};

export function UsageMeter({
  label,
  valueLabel,
  progress,
  fillColor = colors.accent,
  height = 9,
  footer,
}: UsageMeterProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{valueLabel}</Text>
      <ProgressBar
        progress={progress}
        height={height}
        fillColor={fillColor}
        trackColor="#ECECEC"
        style={styles.bar}
      />
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

export function meterProgress(used: number, limit: number | null): number {
  if (limit == null || limit <= 0) {
    return 0;
  }
  return Math.min(Math.max(used / limit, 0), 1);
}

const styles = StyleSheet.create({
  root: {
    gap: 0,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.textDark,
    marginBottom: 12,
  },
  value: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.textDark,
    marginBottom: 8,
  },
  bar: {
    borderRadius: 3,
    overflow: 'hidden',
  },
  footer: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: '#727272',
    marginTop: 8,
  },
});
