import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fonts } from '@/constants/theme';
import {
  JourneyService,
  type Journey,
  type JourneyState,
} from '@/services/JourneyService';

interface JourneyCardProps {
  state: JourneyState;
}

/**
 * Progress toward the current destination, with the next few shown below.
 *
 * Uses a linear progress bar rather than a ring: rings already represent
 * recovery and step goals elsewhere, and a bar reads more naturally as travel
 * along a route.
 */
export function JourneyCard({ state }: JourneyCardProps) {
  // Which completed badge is expanded. Tapping the same one again collapses it.
  const [selected, setSelected] = useState<Journey | null>(null);

  if (!state.hasData || !state.current) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyTitle}>NO DISTANCE DATA YET</Text>
        <Text style={styles.emptyBody}>
          {state.daysTracked > 0
            ? 'Grant distance access on the Health tab to start tracking your journey.'
            : 'Connect Health Connect on the Health tab to start tracking your journey.'}
        </Text>
      </View>
    );
  }

  const { current, next, completed, totalKm } = state;

  return (
    <View style={styles.card}>
      <View style={styles.headline}>
        <Text style={styles.emoji}>{current.emoji}</Text>
        <View style={styles.headlineText}>
          <Text style={styles.journeyName}>{current.name.toUpperCase()}</Text>
          <Text style={styles.note}>{current.note}</Text>
        </View>
        <Text style={styles.percent}>{current.percent.toFixed(current.percent < 10 ? 1 : 0)}%</Text>
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(1, current.percent)}%` }]} />
      </View>

      <Text style={styles.subline}>
        {JourneyService.formatKm(totalKm)} of {JourneyService.formatKm(current.km)}
        {'  ·  '}
        {JourneyService.formatKm(current.remainingKm)} to go
      </Text>

      {next.length > 0 && (
        <View style={styles.nextBlock}>
          <Text style={styles.nextHeader}>NEXT UP</Text>
          {next.map((j, i) => {
            // The last entry is the pinned finale, not simply the next-but-two.
            const isFinale = i === next.length - 1 && next.length > 1;
            return (
              <View
                key={j.id}
                style={[styles.nextRow, isFinale && styles.finaleRow]}
              >
                <Text style={styles.nextEmoji}>{j.emoji}</Text>
                <Text style={styles.nextName} numberOfLines={1}>
                  {j.name}
                </Text>
                <Text style={[styles.nextPercent, isFinale && styles.finalePercent]}>
                  {j.percent < 0.01 ? '<0.01' : j.percent.toFixed(j.percent < 10 ? 2 : 0)}%
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {completed.length > 0 && (
        <View style={styles.completedBlock}>
          <Text style={styles.nextHeader}>COMPLETED · {completed.length}</Text>
          <View style={styles.badgeRow}>
            {completed.map((j) => (
              <TouchableOpacity
                key={j.id}
                style={[styles.badge, selected?.id === j.id && styles.badgeSelected]}
                onPress={() => setSelected(selected?.id === j.id ? null : j)}
                activeOpacity={0.7}
              >
                <Text style={styles.badgeEmoji}>{j.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {selected && (
            <View style={styles.detail}>
              <Text style={styles.detailName}>{selected.name.toUpperCase()}</Text>
              <Text style={styles.detailNote}>
                {JourneyService.formatKm(selected.km)} · {selected.note}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 18,
  },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 8,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 34,
  },
  headlineText: {
    flex: 1,
  },
  journeyName: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.text,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
    marginTop: 2,
  },
  percent: {
    fontFamily: fonts.numericHeavy,
    fontSize: 24,
    color: colors.accent,
  },
  barTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.bg,
    overflow: 'hidden',
    marginTop: 14,
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 5,
  },
  subline: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 8,
  },
  nextBlock: {
    marginTop: 18,
  },
  nextHeader: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.textFaint,
    letterSpacing: 1,
    marginBottom: 8,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  nextEmoji: {
    fontSize: 16,
  },
  nextName: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  nextPercent: {
    fontFamily: fonts.numeric,
    fontSize: 11,
    color: colors.cyan,
  },
  finaleRow: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.bg,
  },
  finalePercent: {
    color: colors.warn,
  },
  completedBlock: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.bg,
    paddingTop: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEmoji: {
    fontSize: 17,
  },
  badgeSelected: {
    backgroundColor: colors.accent,
  },
  detail: {
    marginTop: 12,
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 12,
  },
  detailName: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 0.5,
  },
  detailNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
});
