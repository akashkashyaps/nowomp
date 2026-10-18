import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fonts } from '@/constants/theme';

interface StatTileProps {
  label: string;
  value: string | number | null;
  unit?: string;
  /** Overrides the default lime accent — used for banded values. */
  valueColor?: string;
  /** Shown when the metric has no data or no permission. */
  hint?: string;
  /** When set, the tile becomes tappable and shows a GRANT affordance. */
  onGrant?: () => void;
}

/**
 * Metric tile matching the stat cards on the stats tab. Renders "--" rather than
 * hiding when a value is missing, so the grid keeps its shape while permissions
 * are partial.
 */
export function StatTile({
  label,
  value,
  unit,
  valueColor,
  hint,
  onGrant,
}: StatTileProps) {
  const missing = value == null || value === '';
  const body = (
    <View style={styles.card}>
      <View style={styles.valueRow}>
        <Text
          style={[
            styles.value,
            { color: missing ? colors.textFaint : valueColor ?? colors.accent },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {missing ? '--' : value}
        </Text>
        {!missing && unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      {missing && onGrant ? (
        <Text style={styles.grant}>GRANT</Text>
      ) : hint ? (
        <Text style={styles.hint} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );

  if (missing && onGrant) {
    return (
      <TouchableOpacity style={styles.flex} onPress={onGrant} activeOpacity={0.7}>
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={styles.flex}>{body}</View>;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    minHeight: 96,
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  value: {
    fontFamily: fonts.numericHeavy,
    fontSize: 22,
  },
  unit: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    marginLeft: 3,
    marginBottom: 3,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 12,
    marginTop: 6,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.textFaint,
    marginTop: 3,
  },
  grant: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.accent,
    marginTop: 4,
    letterSpacing: 1,
  },
});
