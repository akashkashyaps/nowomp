import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronRight } from 'lucide-react-native';
import { ExperimentService, type Experiment } from '@/services/ExperimentService';
import { BLOCK_DAYS, BLOCK_COUNT, EXPERIMENT_DAYS, getTemplate } from '@/constants/experiments';
import { colors, fonts } from '@/constants/theme';
import { addDays } from '@/services/LabService';
import { getTodayLocal } from '@/utils/dateUtils';

/** Verdicts always pair an icon and a word with the colour. */
export const VERDICT_LABELS = {
  worked: { icon: '✅', label: 'Worked', color: colors.accent },
  worse: { icon: '⚠️', label: 'Made it worse', color: colors.danger },
  no_effect: { icon: '➖', label: 'No real effect', color: colors.textMuted },
  inconclusive: { icon: '🤷', label: 'Inconclusive', color: colors.warn },
} as const;

export const experimentEmoji = (exp: Pick<Experiment, 'template_id'>) =>
  getTemplate(exp.template_id)?.emoji ?? '🧪';

/** The four blocks as a strip: lit = rule on, dim = rule off, with a today marker. */
export function PhaseStrip({ exp, today }: { exp: Experiment; today?: string }) {
  const pos = today ? ExperimentService.phaseOn(exp, today) : null;
  return (
    <View>
      <View style={styles.strip}>
        {exp.schedule.map((phase, b) => (
          <View key={b} style={[styles.block, phase === 'B' ? styles.blockOn : styles.blockOff]}>
            <Text style={[styles.blockText, phase === 'B' && styles.blockTextOn]}>
              {phase === 'B' ? 'ON' : 'OFF'}
            </Text>
          </View>
        ))}
        {pos && (
          <View
            pointerEvents="none"
            style={[styles.marker, { left: `${((pos.day + 0.5) / EXPERIMENT_DAYS) * 100}%` }]}
          />
        )}
      </View>
      <View style={styles.stripLabels}>
        {Array.from({ length: BLOCK_COUNT }, (_, b) => (
          <Text key={b} style={styles.stripLabel}>
            Week {b + 1}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function ExperimentCard({
  exp,
  checkins,
  onChanged,
}: {
  exp: Experiment;
  checkins: Map<string, boolean>;
  onChanged: () => void;
}) {
  const today = getTodayLocal();
  const yesterday = addDays(today, -1);
  const pos = ExperimentService.phaseOn(exp, today);
  const yesterdayPos = ExperimentService.phaseOn(exp, yesterday);
  const notStarted = today < exp.start_date;
  const elapsed = pos ? pos.day + 1 : notStarted ? 0 : EXPERIMENT_DAYS;
  const complied = [...checkins.values()].filter(Boolean).length;

  const record = async (date: string, ok: boolean) => {
    Haptics.impactAsync(ok ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    try {
      await ExperimentService.checkIn(exp, date, ok);
      onChanged();
    } catch (error) {
      Alert.alert('Error', (error as Error).message);
    }
  };

  const phase = pos?.phase ?? exp.schedule[0];
  const ruleText = phase === 'B' ? exp.rule : exp.off_rule;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.titleRow}
        onPress={() => router.push({ pathname: '/experiment/[id]', params: { id: String(exp.id) } })}
        activeOpacity={0.7}
      >
        <Text style={styles.emoji}>{experimentEmoji(exp)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {exp.title}
          </Text>
          <Text style={styles.meta}>
            {notStarted
              ? 'Starts tomorrow'
              : pos
                ? `Week ${pos.block + 1} of ${BLOCK_COUNT} · day ${pos.day + 1} of ${EXPERIMENT_DAYS}`
                : 'Finished. Results tomorrow, once the last night syncs'}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textDim} />
      </TouchableOpacity>

      <View style={[styles.phaseBanner, phase === 'B' ? styles.phaseOn : styles.phaseOff]}>
        <Text style={[styles.phaseLabel, phase === 'B' && styles.phaseLabelOn]}>
          {notStarted ? 'WEEK 1: ' : pos ? 'THIS WEEK: ' : ''}
          {phase === 'B' ? 'RULE ON' : 'RULE OFF'}
        </Text>
        <Text style={styles.phaseRule}>{ruleText}</Text>
      </View>

      <PhaseStrip exp={exp} today={today} />

      {pos && (
        <View style={styles.checkin}>
          <Text style={styles.checkinQ}>
            {phase === 'B' ? 'Did you stick to the rule today?' : 'Did you live normally today (no rule)?'}
          </Text>
          {checkins.has(today) ? (
            <View style={styles.doneRow}>
              <Text style={styles.doneText}>
                {checkins.get(today) ? '✅ Checked in: stuck to it' : '❌ Checked in: didn’t stick to it'}
              </Text>
              <TouchableOpacity onPress={() => record(today, !checkins.get(today))}>
                <Text style={styles.changeText}>CHANGE</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.btn, styles.btnYes]} onPress={() => record(today, true)}>
                <Text style={styles.btnYesText}>✅ YES</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnNo]} onPress={() => record(today, false)}>
                <Text style={styles.btnNoText}>❌ NO</Text>
              </TouchableOpacity>
            </View>
          )}
          {yesterdayPos && !checkins.has(yesterday) && (
            <View style={styles.yesterday}>
              <Text style={styles.yesterdayText}>Forgot yesterday?</Text>
              <TouchableOpacity onPress={() => record(yesterday, true)}>
                <Text style={styles.yesterdayBtn}>✅ Stuck to it</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => record(yesterday, false)}>
                <Text style={styles.yesterdayBtn}>❌ Didn’t</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {elapsed > 0 && (
        <Text style={styles.compliance}>
          Followed the plan on {complied} of {elapsed} days
          {elapsed >= BLOCK_DAYS && complied / elapsed < 0.7 ? '. Below 70% the result won’t count.' : ''}
        </Text>
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
    borderColor: colors.accent,
    gap: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 28,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.text,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textDim,
    marginTop: 2,
  },
  phaseBanner: {
    borderRadius: 12,
    padding: 12,
  },
  phaseOn: {
    backgroundColor: 'rgba(168, 255, 62, 0.12)',
  },
  phaseOff: {
    backgroundColor: '#242424',
  },
  phaseLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: 4,
  },
  phaseLabelOn: {
    color: colors.accent,
  },
  phaseRule: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  strip: {
    flexDirection: 'row',
    gap: 2,
    height: 22,
  },
  block: {
    flex: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockOn: {
    backgroundColor: colors.accent,
  },
  blockOff: {
    backgroundColor: colors.border,
  },
  blockText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
  },
  blockTextOn: {
    color: colors.bg,
  },
  marker: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    width: 3,
    marginLeft: -1.5,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  stripLabels: {
    flexDirection: 'row',
    marginTop: 4,
  },
  stripLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
  },
  checkin: {
    gap: 10,
  },
  checkinQ: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.text,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnYes: {
    backgroundColor: colors.accent,
  },
  btnYesText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.bg,
  },
  btnNo: {
    borderWidth: 1,
    borderColor: colors.danger,
  },
  btnNoText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.danger,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  doneText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  changeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.accent,
  },
  yesterday: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  yesterdayText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textDim,
  },
  yesterdayBtn: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    color: colors.text,
  },
  compliance: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textDim,
  },
});
