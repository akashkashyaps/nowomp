import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/constants/theme';

/**
 * Shown while the recovery baseline is still being learned. Recovery and sleep
 * scores compare you with your own normal, so they need about a week of heart
 * data before they mean anything; this says so instead of leaving a lone
 * caption under the ring.
 */
export function CalibrationCard({ days, needed }: { days: number; needed: number }) {
  const left = Math.max(0, needed - days);
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.title}>CALIBRATING TO YOU</Text>
        <Text style={styles.count}>
          DAY {Math.min(days, needed)}/{needed}
        </Text>
      </View>
      <View style={styles.bar}>
        {Array.from({ length: needed }, (_, i) => (
          <View key={i} style={[styles.seg, i < days && styles.segOn, i === days && styles.segNext]} />
        ))}
      </View>
      <Text style={styles.body}>
        Recovery compares you with your own normal, so NoWomp needs {needed} days of your heart data to learn
        it. Until then, scores are rough estimates.
      </Text>
      <Text style={styles.tip}>
        {left === 1 ? '1 more day.' : `${left} more days.`} Wear your watch, especially to bed.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.warn,
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.heading, fontSize: 16, color: colors.warn },
  count: { fontFamily: fonts.numeric, fontSize: 13, color: colors.text },
  bar: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 10, borderRadius: 2, backgroundColor: '#2a2a2a' },
  segOn: { backgroundColor: colors.warn },
  segNext: { backgroundColor: '#5a4a1a' },
  body: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  tip: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
});
