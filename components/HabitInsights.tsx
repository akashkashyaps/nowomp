import { View, Text, StyleSheet } from 'react-native';
import type { BestTimeReport, HabitReport, Slot } from '@/services/HabitInsightsService';
import { HABIT_LABELS } from '@/services/HabitInsightsService';
import { colors, fonts, chartColors } from '@/constants/theme';

const SLOT_LABEL: Record<Slot, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const MAX_FINDINGS = 4;

/** "Habits → your body": what the morning after a habit looks like. */
export function HabitsCard({ report }: { report: HabitReport }) {
  const shown = report.findings.slice(0, MAX_FINDINGS);
  return (
    <View style={styles.card}>
      <Text style={styles.label}>HABITS → YOUR BODY</Text>
      {shown.length > 0 ? (
        shown.map((f) => (
          <View key={`${f.habit}-${f.outcome}`} style={styles.row}>
            {/* Icon + word, never colour alone. */}
            <Text style={styles.icon}>{f.betterPct >= 0 ? '▲' : '▼'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.text}>{f.text}</Text>
              <Text style={styles.meta}>
                {f.nWith} vs {f.nWithout} days
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>
          No clear link yet between your habits and how you recover. That needs about 4 logged days on each side.
        </Text>
      )}
      {report.needsData.length > 0 && (
        <Text style={styles.hint}>
          Log {report.needsData.map((h) => HABIT_LABELS[h].toLowerCase()).join(', ')} in the Health journal to include
          {report.needsData.length === 1 ? ' it' : ' them'}.
        </Text>
      )}
      <Text style={styles.footnote}>Patterns in your own data, not proof of cause. An experiment can test one.</Text>
    </View>
  );
}

/** "Best time to train": show-up rate per time of day, as a single-series bar. */
export function BestTimeCard({ report }: { report: BestTimeReport }) {
  const hasData = report.slots.some((s) => s.sessions > 0);
  return (
    <View style={styles.card}>
      <Text style={styles.label}>BEST TIME TO TRAIN</Text>
      {hasData ? (
        <>
          {report.slots.map((s) => (
            <View key={s.slot} style={styles.slotRow}>
              <Text style={[styles.slotName, report.best === s.slot && styles.slotBest]}>
                {SLOT_LABEL[s.slot]}
              </Text>
              <View style={styles.track}>
                {s.rate != null && <View style={[styles.fill, { width: `${Math.max(4, s.rate * 100)}%` }]} />}
              </View>
              <Text style={styles.slotValue}>{s.rate != null ? `${Math.round(s.rate * 100)}%` : '–'}</Text>
            </View>
          ))}
          <Text style={styles.text}>
            {report.text ?? 'Needs 3+ sessions in at least two times of day to compare.'}
          </Text>
          {report.slots.some((s) => s.avgMinutes != null) && (
            <Text style={styles.meta}>
              Average session:{' '}
              {report.slots
                .filter((s) => s.avgMinutes != null)
                .map((s) => `${SLOT_LABEL[s.slot].toLowerCase()} ${Math.round(s.avgMinutes!)} min`)
                .join(' · ')}
            </Text>
          )}
        </>
      ) : (
        <Text style={styles.empty}>Shows up once you have a few workouts and excuses on record.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  label: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, color: colors.textDim },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  icon: { fontSize: 12, color: colors.textMuted, marginTop: 3, width: 14 },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: 11, color: colors.textDim },
  empty: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.warn, lineHeight: 17 },
  footnote: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slotName: { width: 78, fontFamily: fonts.bodySemi, fontSize: 13, color: colors.textMuted },
  slotBest: { color: colors.text },
  track: { flex: 1, height: 10, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: chartColors.blue, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  slotValue: { width: 40, textAlign: 'right', fontFamily: fonts.numeric, fontSize: 12, color: colors.text },
});
