import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PixelBadge } from '@/components/PixelBadge';
import { WeeklyRecapService, type RecapMood, type WeeklyRecap } from '@/services/WeeklyRecapService';
import { formatMinutes } from '@/services/LabService';
import { getExcuse } from '@/constants/excuses';
import { colors, fonts } from '@/constants/theme';
import { parseLocalDateString } from '@/utils/dateUtils';

/** Each mood borrows a trophy scene, so the recap speaks the same visual language. */
const MOOD_ART: Record<RecapMood, string> = {
  perfect: 'legend',
  solid: 'first_rep',
  mixed: 'comeback_kid',
  rough: 'serial_skipper',
  ghost: 'forever_alone',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const fmtRange = (a: string, b: string) => {
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${parseLocalDateString(a).toLocaleDateString('en-US', o)} – ${parseLocalDateString(b).toLocaleDateString('en-US', o)}`.toUpperCase();
};

export default function RecapScreen() {
  const insets = useSafeAreaInsets();
  const [recap, setRecap] = useState<WeeklyRecap | null | undefined>(undefined);

  useEffect(() => {
    WeeklyRecapService.build()
      .then((r) => {
        setRecap(r);
        if (r) WeeklyRecapService.markSeen(r.weekStart);
      })
      .catch(() => setRecap(null));
  }, []);

  return (
    <View style={styles.container}>
      <ScreenHeader title="YOUR WEEK" subtitle={recap ? fmtRange(recap.weekStart, recap.weekEnd) : undefined} />
      {recap === undefined ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : recap === null ? (
        <Text style={styles.empty}>Nothing to recap yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
          <View style={styles.hero}>
            <PixelBadge id={MOOD_ART[recap.mood]} size={150} />
            <Text style={styles.headline}>{recap.headline}</Text>
          </View>

          <View style={styles.grid}>
            <Stat label="WORKOUTS" value={String(recap.workouts)} />
            <Stat label="SKIPPED" value={String(recap.skips)} danger={recap.skips > 0} />
            <Stat label="SHOW-UP" value={recap.showUpRate != null ? `${recap.showUpRate}%` : '–'} />
          </View>
          <View style={styles.grid}>
            <Stat label="MINUTES" value={String(recap.minutes)} />
            <Stat label="STREAK" value={`${recap.streak} 🔥`} />
            <Stat label="TROPHIES" value={String(recap.trophies.length)} />
          </View>

          {(recap.sleep.avg != null || recap.steps.avg != null || recap.recovery.avg != null) && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>YOUR BODY VS LAST WEEK</Text>
              <Delta label="Sleep" now={recap.sleep.avg} prev={recap.sleep.prev} format={(v) => formatMinutes(v)} />
              <Delta label="Steps" now={recap.steps.avg} prev={recap.steps.prev} format={(v) => Math.round(v).toLocaleString()} />
              <Delta label="Recovery" now={recap.recovery.avg} prev={recap.recovery.prev} format={(v) => `${Math.round(v)}%`} />
            </View>
          )}

          {(recap.topExcuse || recap.bestDay) && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>HIGHLIGHTS</Text>
              {recap.bestDay && (
                <Text style={styles.line}>
                  💪 Longest session: {DAY_NAMES[recap.bestDay.day]}, {recap.bestDay.minutes} min
                </Text>
              )}
              {recap.topExcuse && (
                <Text style={styles.line}>
                  {getExcuse(recap.topExcuse).emoji} Top excuse: {getExcuse(recap.topExcuse).short}
                </Text>
              )}
              {recap.disputedExcuses > 0 && (
                <Text style={[styles.line, { color: colors.danger }]}>
                  🤨 Your body disagreed with {recap.disputedExcuses}{' '}
                  {recap.disputedExcuses === 1 ? 'excuse' : 'excuses'}
                </Text>
              )}
            </View>
          )}

          {recap.trophies.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>EARNED THIS WEEK</Text>
              <View style={styles.trophies}>
                {recap.trophies.map((t) => (
                  <View key={t.id} style={styles.trophy}>
                    <PixelBadge id={t.id} size={64} />
                    <Text style={styles.trophyName} numberOfLines={2}>
                      {t.title}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.cta} onPress={() => router.replace('/(tabs)/lab')}>
            <Text style={styles.ctaText}>DIG INTO THE LAB</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, danger && { color: colors.danger }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Delta({
  label,
  now,
  prev,
  format,
}: {
  label: string;
  now: number | null;
  prev: number | null;
  format: (v: number) => string;
}) {
  if (now == null) return null;
  const diff = prev != null ? now - prev : null;
  const up = diff != null && diff > 0;
  const flat = diff == null || Math.abs(diff) < Math.abs(prev ?? 1) * 0.02;
  return (
    <View style={styles.deltaRow}>
      <Text style={styles.deltaLabel}>{label}</Text>
      <Text style={styles.deltaValue}>{format(now)}</Text>
      <Text style={[styles.deltaChange, { color: flat ? colors.textDim : up ? colors.accent : colors.warn }]}>
        {diff == null ? 'new' : flat ? '— same' : `${up ? '▲' : '▼'} ${format(Math.abs(diff))}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', marginTop: 48 },
  hero: { alignItems: 'center', marginBottom: 20 },
  headline: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 30,
  },
  grid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontFamily: fonts.numericHeavy, fontSize: 22, color: colors.accent },
  statLabel: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1, color: colors.textMuted, marginTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  cardLabel: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, color: colors.textDim },
  deltaRow: { flexDirection: 'row', alignItems: 'center' },
  deltaLabel: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text },
  deltaValue: { fontFamily: fonts.numeric, fontSize: 14, color: colors.text, minWidth: 80, textAlign: 'right' },
  deltaChange: { fontFamily: fonts.bodySemi, fontSize: 12, minWidth: 90, textAlign: 'right' },
  line: { fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 },
  trophies: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  trophy: { width: 72, alignItems: 'center', gap: 4 },
  trophyName: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  ctaText: { fontFamily: fonts.heading, fontSize: 16, color: colors.bg },
});
