import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  Settings,
  CalendarDays,
  ChevronRight,
  ChartBar as BarChart3,
  BookOpen,
} from 'lucide-react-native';
import { WorkoutService } from '@/services/WorkoutService';
import { FreezeTokenService } from '@/services/FreezeTokenService';
import { SkipService } from '@/services/SkipService';
import { RedemptionWorkoutService } from '@/services/RedemptionWorkoutService';
import { UserService } from '@/services/UserService';
import { JourneyService, type JourneyState } from '@/services/JourneyService';
import { AchievementService } from '@/services/AchievementService';
import { BackupReminderService } from '@/services/BackupReminderService';
import { BackgroundReliabilityService } from '@/services/BackgroundReliabilityService';
import { BackgroundReliabilityCard } from '@/components/BackgroundReliabilityCard';
import { JourneyCard } from '@/components/JourneyCard';
import { PixelBadge } from '@/components/PixelBadge';
import type { AchievementDefinition } from '@/constants/achievements';
import { colors, fonts } from '@/constants/theme';
import { TourTarget, useFirstVisitTour } from '@/components/tour/Tour';
import { YOU_TOUR, YOU_TOUR_STEPS } from '@/constants/tour';

/**
 * The "You" tab: profile, trophy shelf and lifetime stats in one place.
 * Replaces the old Stats and More tabs — Settings and Plan open from here.
 */
export default function YouScreen() {
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState('');
  const [streak, setStreak] = useState(0);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [totalSport, setTotalSport] = useState(0);
  const [totalSkips, setTotalSkips] = useState(0);
  const [freezeTokenStats, setFreezeTokenStats] = useState({
    availableTokens: 0,
    totalEarned: 0,
    totalUsed: 0,
    totalExpired: 0,
  });
  const [progressToNext, setProgressToNext] = useState({
    currentStreak: 0,
    nextMilestone: 15,
    daysToNext: 15,
    progressText: '',
  });
  const [daysWithoutExcuse, setDaysWithoutExcuse] = useState(0);
  const [scheduleChanges, setScheduleChanges] = useState({
    thisWeek: 0,
    lastWeek: 0,
  });
  const [highestStreak, setHighestStreak] = useState(0);
  const [averageGymTime, setAverageGymTime] = useState(0);
  const [completedRedemptions, setCompletedRedemptions] = useState(0);
  const [journeyState, setJourneyState] = useState<JourneyState | null>(null);
  const [showReliability, setShowReliability] = useState(false);
  const [backupDue, setBackupDue] = useState<{ days: number | null } | null>(
    null,
  );
  const [trophies, setTrophies] = useState<{
    unlocked: number;
    total: number;
    unseen: number;
    recent: AchievementDefinition[];
  } | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, []),
  );

  const loadData = async () => {
    try {
      const [streakData, workoutsData, skipsData, user] = await Promise.all([
        WorkoutService.getCurrentStreak().catch(() => 0),
        WorkoutService.getSessionCounts().catch(() => ({ workouts: 0, sport: 0 })),
        SkipService.getTotalSkips().catch(() => 0),
        UserService.getCurrentUser().catch(() => null),
      ]);

      setStreak(streakData);
      setTotalWorkouts(workoutsData.workouts);
      setTotalSport(workoutsData.sport);
      setTotalSkips(skipsData);
      setDisplayName(user?.display_name ?? '');
      setShowReliability(await BackgroundReliabilityService.shouldPrompt());
      if (await BackupReminderService.isDue(user?.created_at)) {
        setBackupDue({ days: await BackupReminderService.daysSinceBackup() });
      } else {
        setBackupDue(null);
      }

      // Each block below loads separately so one failure never blanks the rest.
      try {
        const freezeStats = await FreezeTokenService.getTokenStats();
        const progressData =
          await FreezeTokenService.getProgressToNextToken(streakData);
        setFreezeTokenStats(freezeStats);
        setProgressToNext(progressData);
      } catch (error) {
        console.error('Error loading freeze token stats:', error);
      }

      try {
        const redemptionData =
          await RedemptionWorkoutService.getRedemptionStats();
        setCompletedRedemptions(redemptionData.completedRedemptions);
      } catch (error) {
        console.error('Error loading redemption stats:', error);
      }

      try {
        // Persist any newly-crossed journeys so their achievement dates are
        // recorded even if the celebration screen is never seen.
        await JourneyService.recordCompletions();
        setJourneyState(await JourneyService.getJourneyProgress());
      } catch (error) {
        console.error('Error loading journey progress:', error);
        setJourneyState(null);
      }

      try {
        setDaysWithoutExcuse(await SkipService.getDaysWithoutExcuse());
      } catch (error) {
        console.error('Error loading days without excuse:', error);
      }

      try {
        setScheduleChanges(await UserService.getScheduleChangesComparison());
      } catch (error) {
        console.error('Error loading schedule changes:', error);
      }

      try {
        setHighestStreak(await UserService.getHighestStreak());
      } catch (error) {
        console.error('Error loading highest streak:', error);
      }

      try {
        setAverageGymTime(await WorkoutService.getAverageGymDuration());
      } catch (error) {
        console.error('Error loading average gym time:', error);
      }

      // Catch up on anything earned since the last check (e.g. after a health
      // sync), then load the shelf.
      try {
        await AchievementService.evaluate();
        setTrophies(await AchievementService.getSummary());
      } catch (error) {
        console.error('Error loading achievements:', error);
      }
    } catch (error) {
      console.error('Error loading profile data:', error);
    }
  };

  const scrollRef = React.useRef<ScrollView>(null);
  useFirstVisitTour(YOU_TOUR, YOU_TOUR_STEPS, undefined, { delayMs: 800 });

  const open = (
    path: '/settings' | '/plan' | '/achievements' | '/recap' | '/rules',
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path);
  };

  const formatDurationInMinutes = (seconds: number): string => {
    if (seconds === 0) return '0';
    return Math.round(seconds / 60).toString();
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName.toUpperCase() || 'YOU'}
          </Text>
        </View>
        <TourTarget id="you.settings">
          <TouchableOpacity
            onPress={() => open('/settings')}
            style={styles.headerIcon}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Settings size={22} color={colors.text} strokeWidth={2.2} />
          </TouchableOpacity>
        </TourTarget>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >
        {showReliability && (
          <BackgroundReliabilityCard onDone={() => setShowReliability(false)} />
        )}

        {backupDue && (
          <TouchableOpacity
            style={styles.backupCard}
            onPress={() => open('/settings')}
            activeOpacity={0.8}
          >
            <Text style={styles.backupTitle}>💾 Time for a backup</Text>
            <Text style={styles.backupBody}>
              {backupDue.days == null
                ? 'Your data only lives on this phone and has never been exported.'
                : `Last export was ${backupDue.days} days ago.`}{' '}
              Settings → Export takes a few seconds.
            </Text>
          </TouchableOpacity>
        )}

        {/* Trophy shelf */}
        <TourTarget id="you.trophies" scrollRef={scrollRef} style={styles.gap12}>
          <TouchableOpacity
            style={styles.trophyCard}
            onPress={() => open('/achievements')}
            activeOpacity={0.8}
          >
            <View style={styles.trophyTop}>
              <Text style={styles.trophyTitle}>🏆 TROPHIES</Text>
              {trophies && trophies.unseen > 0 && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>{trophies.unseen} NEW</Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              <Text style={styles.trophyCount}>
                {trophies ? `${trophies.unlocked}/${trophies.total}` : '–'}
              </Text>
              <ChevronRight size={18} color={colors.textDim} />
            </View>
            <View style={styles.trophyShelf}>
              {trophies && trophies.recent.length > 0 ? (
                trophies.recent.map((a) => (
                  <PixelBadge key={a.id} id={a.id} size={48} />
                ))
              ) : (
                <Text style={styles.trophyEmpty}>
                  Finish your first workout to earn a trophy.
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </TourTarget>

        <TourTarget
          id="you.links"
          scrollRef={scrollRef}
          style={styles.linkGroupWrap}
        >
          <View style={styles.linkGroup}>
            <TouchableOpacity
              style={styles.linkItem}
              onPress={() => open('/plan')}
              activeOpacity={0.8}
            >
              <CalendarDays size={18} color={colors.accent} strokeWidth={2.5} />
              <Text style={styles.linkText}>Plan workouts</Text>
              <ChevronRight size={18} color={colors.textDim} />
            </TouchableOpacity>
            <View style={styles.linkDivider} />
            <TouchableOpacity
              style={styles.linkItem}
              onPress={() => open('/recap')}
              activeOpacity={0.8}
            >
              <BarChart3 size={18} color={colors.accent} strokeWidth={2.5} />
              <Text style={styles.linkText}>Weekly recap</Text>
              <ChevronRight size={18} color={colors.textDim} />
            </TouchableOpacity>
            <View style={styles.linkDivider} />
            <TouchableOpacity
              style={styles.linkItem}
              onPress={() => open('/rules')}
              activeOpacity={0.8}
            >
              <BookOpen size={18} color={colors.accent} strokeWidth={2.5} />
              <Text style={styles.linkText}>How NoWomp works</Text>
              <ChevronRight size={18} color={colors.textDim} />
            </TouchableOpacity>
          </View>
        </TourTarget>

        {/* Stats Cards */}
        <TourTarget id="you.stats" scrollRef={scrollRef} style={styles.gap16}>
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{streak}</Text>
              <Text style={styles.statLabel}>CURRENT STREAK</Text>
              <Text style={styles.statEmoji}>🔥</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{totalWorkouts}</Text>
              <Text style={styles.statLabel}>VERIFIED WORKOUTS</Text>
              {totalSport > 0 ? (
                <Text style={styles.statExtra} numberOfLines={1}>+ {totalSport} SPORT</Text>
              ) : (
                <Text style={styles.statEmoji}>💪</Text>
              )}
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{totalSkips}</Text>
              <Text style={styles.statLabel}>SKIPS</Text>
              <Text style={styles.statEmoji}>😔</Text>
            </View>
          </View>

          <View style={[styles.statsContainer, { marginBottom: 0 }]}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{highestStreak}</Text>
              <Text style={styles.statLabel}>HIGHEST STREAK</Text>
              <Text style={styles.statEmoji}>🏆</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {formatDurationInMinutes(averageGymTime)}
              </Text>
              <Text style={styles.statLabel}>AVG WORKOUT MINS</Text>
              <Text style={styles.statEmoji}>⏱️</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{completedRedemptions}</Text>
              <Text style={styles.statLabel}>REDEEMED WORKOUTS</Text>
              <Text style={styles.statEmoji}>🏅</Text>
            </View>
          </View>
        </TourTarget>

        {/* Journeys — lifetime distance mapped onto real destinations */}
        {journeyState && (
          <TourTarget id="you.journeys" scrollRef={scrollRef}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>JOURNEYS</Text>
              <JourneyCard state={journeyState} />
            </View>
          </TourTarget>
        )}

        {/* Freeze Token Stats */}
        <TourTarget id="you.freeze" scrollRef={scrollRef}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FREEZE TOKEN STATUS</Text>

            <View style={styles.freezeStatsContainer}>
              <View style={styles.freezeStatCard}>
                <Text style={styles.freezeStatNumber}>
                  {freezeTokenStats.availableTokens}
                </Text>
                <Text style={styles.freezeStatLabel}>AVAILABLE</Text>
              </View>
              <View style={styles.freezeStatCard}>
                <Text style={styles.freezeStatNumber}>
                  {freezeTokenStats.totalEarned}
                </Text>
                <Text style={styles.freezeStatLabel}>EARNED</Text>
              </View>
              <View style={styles.freezeStatCard}>
                <Text style={styles.freezeStatNumber}>
                  {freezeTokenStats.totalUsed}
                </Text>
                <Text style={styles.freezeStatLabel}>USED</Text>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <Text style={styles.progressTitle}>Progress to Next Token</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${((progressToNext.currentStreak % 15) / 15) * 100}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {progressToNext.progressText}
              </Text>
            </View>
          </View>
        </TourTarget>

        {/* Days Without Excuse + Schedule Changes */}
        <TourTarget id="you.consistency" scrollRef={scrollRef}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>HOW CONSISTENT ARE YOU?</Text>

            <View style={styles.excuseFreeContainer}>
              <Text style={styles.excuseFreeNumber}>{daysWithoutExcuse}</Text>
              <Text style={styles.excuseFreeLabel}>
                {daysWithoutExcuse === 1 ? 'DAY' : 'DAYS'} WITHOUT EXCUSE
              </Text>
            </View>
          </View>

          {/* Schedule Changes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>STICKING TO YOUR SCHEDULE?</Text>

            <View style={styles.scheduleComparisonContainer}>
              <View style={styles.scheduleWeekCard}>
                <Text style={styles.scheduleWeekLabel}>THIS WEEK</Text>
                <Text style={styles.scheduleWeekNumber}>
                  {scheduleChanges.thisWeek}
                </Text>
                <Text style={styles.scheduleWeekSubtext}>
                  {scheduleChanges.thisWeek === 1 ? 'CHANGE' : 'CHANGES'}
                </Text>
              </View>

              <View style={styles.scheduleWeekCard}>
                <Text style={styles.scheduleWeekLabel}>LAST WEEK</Text>
                <Text
                  style={[
                    styles.scheduleWeekNumber,
                    styles.scheduleLastWeekNumber,
                  ]}
                >
                  {scheduleChanges.lastWeek}
                </Text>
                <Text style={styles.scheduleWeekSubtext}>
                  {scheduleChanges.lastWeek === 1 ? 'CHANGE' : 'CHANGES'}
                </Text>
              </View>
            </View>
          </View>
        </TourTarget>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 14,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.heading,
    fontSize: 30,
    color: colors.text,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  backupCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.warn,
  },
  backupTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.warn,
  },
  backupBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  trophyCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Spacing lives on the tour wrappers so the highlight ring hugs the content.
  gap12: { marginBottom: 12 },
  gap16: { marginBottom: 16 },
  trophyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trophyTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.text,
  },
  trophyCount: {
    fontFamily: fonts.numeric,
    fontSize: 14,
    color: colors.accent,
  },
  newBadge: {
    backgroundColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.text,
  },
  trophyShelf: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    minHeight: 44,
    alignItems: 'center',
  },
  trophyEmpty: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textDim,
  },
  linkGroupWrap: {
    marginBottom: 28,
  },
  linkGroup: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linkDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 46,
  },
  linkText: {
    flex: 1,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.text,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  statNumber: {
    fontFamily: fonts.numericHeavy,
    fontSize: 28,
    color: colors.accent,
    marginBottom: 4,
  },
  statLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 12,
  },
  statEmoji: {
    fontSize: 20,
    marginTop: 4,
  },
  statExtra: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.cyan,
    marginTop: 8,
  },
  section: {
    marginTop: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.accent,
    marginBottom: 16,
  },
  freezeStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
  },
  freezeStatCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.cyan,
  },
  freezeStatNumber: {
    fontFamily: fonts.numericHeavy,
    fontSize: 24,
    color: colors.cyan,
    marginBottom: 4,
  },
  freezeStatLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 12,
  },
  progressContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
  },
  progressTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.cyan,
    borderRadius: 4,
  },
  progressText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  excuseFreeContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  excuseFreeNumber: {
    fontFamily: fonts.numericHeavy,
    fontSize: 48,
    color: colors.accent,
    marginBottom: 8,
  },
  excuseFreeLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    letterSpacing: 1,
  },
  scheduleComparisonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  scheduleWeekCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  scheduleWeekLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textDim,
    marginBottom: 12,
    letterSpacing: 1,
  },
  scheduleWeekNumber: {
    fontFamily: fonts.numericHeavy,
    fontSize: 36,
    color: colors.accent,
    marginBottom: 8,
  },
  scheduleLastWeekNumber: {
    color: colors.textFaint,
  },
  scheduleWeekSubtext: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1,
  },
});
