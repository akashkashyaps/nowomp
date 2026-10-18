import React, { useState, useEffect } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { UserService } from '@/services/UserService';
import { WorkoutService } from '@/services/WorkoutService';
import { LocationService } from '@/services/LocationService';
import { NotificationService } from '@/services/NotificationService';
import { JourneyService } from '@/services/JourneyService';
import { FreezeTokenService } from '@/services/FreezeTokenService';
import { RedemptionWorkoutService } from '@/services/RedemptionWorkoutService';
import { REDEMPTION_BLOCKS_EXCUSES } from '@/services/ExcuseSubmissionService';
import { CalendarDays } from 'lucide-react-native';
import { TourTarget, useFirstVisitTour } from '@/components/tour/Tour';
import { HOME_TOUR, HOME_TOUR_STEPS } from '@/constants/tour';
import { WeeklyRecapService } from '@/services/WeeklyRecapService';
import { WidgetService } from '@/services/WidgetService';

import { colors, fonts } from '@/constants/theme';
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [showRecap, setShowRecap] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [streak, setStreak] = useState(0);
  const [todayWorkout, setTodayWorkout] = useState<{
    time: string;
    date: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentWorkout, setCurrentWorkout] = useState<any>(null);
  const [workoutTimer, setWorkoutTimer] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(
    null,
  );
  const [todayStatus, setTodayStatus] = useState<{
    hasCompleted: boolean;
    hasSkipped: boolean;
    skipReason?: string;
  }>({
    hasCompleted: false,
    hasSkipped: false,
  });
  const [freezeTokens, setFreezeTokens] = useState(0);
  const [redemptionCountdown, setRedemptionCountdown] = useState<{
    isActive: boolean;
    hasStarted?: boolean;
    hoursRemaining?: number;
    minutesRemaining?: number;
    hoursToStart?: number;
    minutesToStart?: number;
  } | null>(null);
  const [activeRedemption, setActiveRedemption] = useState<any | null>(null);

  useEffect(() => {
    loadUserData();
    loadStreakData();
    loadTodayWorkout();
    checkCurrentWorkout();
    checkTodayStatus();
    loadFreezeTokens();
    checkRedemptionStatus();
    // Mount only: checks for a workout already in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh data when screen comes into focus (e.g., returning from settings or calendar)
  useFocusEffect(
    React.useCallback(() => {
      console.log('Home screen focused - refreshing data...');
      // Add small delay to avoid rapid multiple calls and prevent database connection conflicts
      const timeoutId = setTimeout(async () => {
        try {
          await loadUserData();
          await loadStreakData(); // Always refresh streak — may have changed due to failed redemption
          await loadTodayWorkout();
          await checkCurrentWorkout();
          await checkTodayStatus();
          await loadFreezeTokens();
          await checkRedemptionStatus();
          setShowRecap(await WeeklyRecapService.shouldShowCard().catch(() => false));
          // Coming back here after an excuse, a plan change or a workout keeps
          // the home-screen widget in step.
          WidgetService.refresh();
        } catch (error) {
          console.warn('Error refreshing data on focus:', error);
        }
      }, 200); // Increased delay to prevent database connection issues

      return () => clearTimeout(timeoutId);
      // Runs on every focus; the loaders are re-created each render, so
      // listing them would refire this constantly.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  useEffect(() => {
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [timerInterval]);

  const loadUserData = async () => {
    try {
      const userData = await UserService.getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadStreakData = async () => {
    try {
      const streakData = await WorkoutService.getCurrentStreak();
      setStreak(streakData);
    } catch (error) {
      console.error('Error loading streak:', error);
      setStreak(0);
    }
  };

  const loadTodayWorkout = async () => {
    try {
      console.log('=== HOME SCREEN: LOADING TODAY WORKOUT ===');
      const workout = await WorkoutService.getTodayScheduledWorkout();
      console.log('Received workout from service:', workout);
      setTodayWorkout(workout);
      console.log('=========================================');
    } catch (error) {
      console.error('Error loading today workout:', error);
    }
  };

  const checkCurrentWorkout = async () => {
    try {
      const workout = await WorkoutService.getCurrentWorkout();
      if (workout) {
        setCurrentWorkout(workout);
        if (workout.started_at) {
          const startTime = new Date(workout.started_at).getTime();
          const now = Date.now();
          const elapsed = Math.floor((now - startTime) / 1000);
          setWorkoutTimer(elapsed);
          startTimer();
        }
      }
    } catch (error) {
      console.error('Error checking current workout:', error);
    }
  };

  const checkTodayStatus = async () => {
    try {
      const status = await WorkoutService.getTodayStatus();
      setTodayStatus(status);
      console.log('Today status:', status);
    } catch (error) {
      console.error('Error checking today status:', error);
      // Set default status if there's an error to prevent app crashes
      setTodayStatus({
        hasCompleted: false,
        hasSkipped: false,
      });
    }
  };

  const loadFreezeTokens = async () => {
    try {
      const count = await FreezeTokenService.getAvailableTokenCount();
      setFreezeTokens(count);
    } catch (error) {
      console.error('Error loading freeze tokens:', error);
    }
  };

  const checkRedemptionStatus = async () => {
    try {
      const countdown = await RedemptionWorkoutService.getRedemptionCountdown();
      setRedemptionCountdown(countdown);

      // Also fetch the full redemption object to get type and target date
      const redemption =
        await RedemptionWorkoutService.getActiveRedemptionWorkout();
      setActiveRedemption(redemption);
    } catch (error) {
      console.error('Error checking redemption status:', error);
      setRedemptionCountdown({ isActive: false });
      setActiveRedemption(null);
    }
  };

  const startTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    const interval = setInterval(() => {
      setWorkoutTimer((prev) => prev + 1);
    }, 1000) as unknown as NodeJS.Timeout;
    setTimerInterval(interval);
  };

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartWorkout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setLoading(true);
    try {
      const isAtGym = await LocationService.verifyGymLocation();

      if (isAtGym) {
        const workout = await WorkoutService.startWorkout();
        setCurrentWorkout(workout);
        setWorkoutTimer(0);
        startTimer();

        // Cancel any pending notifications
        await NotificationService.cancelTodayNotifications();

        // Show persistent workout progress notification
        await NotificationService.showWorkoutProgressNotification(
          new Date(workout.started_at || new Date().toISOString()),
        );
        WidgetService.refresh();

        // Show different messages based on whether workout was scheduled
        if (todayWorkout) {
          const currentTime = new Date();
          const scheduledTime = new Date();
          const [hours, minutes] = todayWorkout.time.split(':');
          scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          const timeDiff = currentTime.getTime() - scheduledTime.getTime();
          const minutesDiff = Math.round(timeDiff / (1000 * 60));

          if (minutesDiff < -15) {
            Alert.alert(
              '💪 EARLY BIRD!',
              `Starting ${Math.abs(minutesDiff)} minutes before your scheduled time? That's the spirit!`,
            );
          } else if (minutesDiff >= -15 && minutesDiff <= 15) {
            Alert.alert(
              '⏰ PERFECT TIMING!',
              "Right on schedule! Let's crush this workout!",
            );
          } else {
            Alert.alert(
              '⏰ BETTER LATE THAN NEVER!',
              `${minutesDiff} minutes late but you showed up! Let's go!`,
            );
          }
        } else {
          Alert.alert(
            '💪 SURPRISE WORKOUT!',
            "No scheduled workout today but you're here anyway? Respect!",
          );
        }
      } else {
        Alert.alert(
          '🚨 BUSTED!',
          "You're not at your gym. Stop lying and get there first.",
          [{ text: 'Fine...', style: 'destructive' }],
        );
      }
    } catch (error: any) {
      console.error('Error starting workout:', error);
      const errorMessage = LocationService.getErrorMessage(error);
      Alert.alert('Location Verification Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEndWorkout = async () => {
    if (!currentWorkout) return;

    // A light tick so the tap feels instant. The celebration's sound and
    // rumble belong to the workout-complete screen, timed to its animation;
    // playing them here made the burst silent and doubled the haptics.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setLoading(true);
    try {
      const completedWorkout = await WorkoutService.endWorkout(
        currentWorkout.id,
      );
      stopTimer();
      setCurrentWorkout(null);
      setWorkoutTimer(0);

      // Get the actual streak from DB (endWorkout already computed and awarded tokens)
      const currentStreak = await WorkoutService.getCurrentStreak();
      setStreak(currentStreak);
      setTodayStatus({ hasCompleted: true, hasSkipped: false });

      // Check if a freeze token milestone was just reached
      const freezeTokenEarned = currentStreak > 0 && currentStreak % 15 === 0;

      // Dismiss workout notification
      await NotificationService.dismissWorkoutProgressNotification();
      WidgetService.refresh();

      // Check whether a distance journey was completed since the last workout.
      let completedJourney: { emoji: string; name: string } | null = null;
      try {
        completedJourney = await JourneyService.consumeNewlyCompletedJourney();
      } catch (error) {
        console.error('Error checking journey completion:', error);
      }

      // Navigate to success page with duration and token info
      router.push({
        pathname: '/workout-success',
        params: {
          duration: completedWorkout.duration,
          ...(freezeTokenEarned ? { freezeTokenEarned: '1' } : {}),
          ...(completedJourney
            ? {
                journeyName: completedJourney.name,
                journeyEmoji: completedJourney.emoji,
              }
            : {}),
          streak: String(currentStreak),
        },
      });
    } catch (error) {
      console.error('Error ending workout:', error);
      Alert.alert('Error', 'Failed to end workout');
    } finally {
      setLoading(false);
    }
  };

  useFirstVisitTour(HOME_TOUR, HOME_TOUR_STEPS, {
    finalAction: {
      label: 'PLAN A WORKOUT',
      onPress: () => router.push('/plan'),
    },
  });

  const handleOpenPlan = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/plan');
  };

  const handleMakeExcuse = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (activeRedemption) {
      Alert.alert(REDEMPTION_BLOCKS_EXCUSES.title, REDEMPTION_BLOCKS_EXCUSES.message);
      return;
    }
    router.push('/excuse');
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 86 }]}>
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <Text style={styles.greeting} numberOfLines={1}>
          SUP, {user?.display_name?.toUpperCase() || 'WARRIOR'}
        </Text>
        <TourTarget id="home.plan">
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleOpenPlan}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Plan workouts"
          >
            <CalendarDays size={22} color={colors.text} strokeWidth={2.2} />
          </TouchableOpacity>
        </TourTarget>
      </View>

      {showRecap && (
        <TouchableOpacity style={styles.recapCard} onPress={() => router.push('/recap')} activeOpacity={0.8}>
          <Text style={styles.recapText}>📊 Your week in review is ready</Text>
          <Text style={styles.recapLink}>OPEN →</Text>
        </TouchableOpacity>
      )}

      <View style={styles.streakContainer}>
        <TourTarget id="home.streak" style={styles.streakTarget}>
          <Text style={styles.streakLabel}>STREAK</Text>
          <Text style={styles.streakNumber}>{streak}</Text>
          <Text style={styles.streakEmoji}>🔥</Text>
        </TourTarget>
      </View>

      {freezeTokens > 0 && (
        <TouchableOpacity
          style={styles.freezeTokensContainer}
          onPress={() => router.push({ pathname: '/rules', params: { section: 'freeze' } })}
          activeOpacity={0.7}
        >
          <Text style={styles.freezeTokensLabel}>FREEZE TOKENS</Text>
          <Text style={styles.freezeTokensNumber}>❄️ {freezeTokens}</Text>
        </TouchableOpacity>
      )}

      {redemptionCountdown?.isActive && activeRedemption && (
        <TouchableOpacity
          style={styles.redemptionContainer}
          onPress={() => router.push({ pathname: '/rules', params: { section: 'redemption' } })}
          activeOpacity={0.8}
        >
          {activeRedemption.redemption_type === 'next_scheduled' &&
          activeRedemption.target_workout_date ? (
            // Next scheduled workout redemption
            <>
              <Text style={styles.redemptionLabel}>
                🎯 COMPLETE YOUR SCHEDULED WORKOUT
              </Text>
              <Text style={styles.redemptionTimer}>
                {new Date(
                  activeRedemption.target_workout_date + 'T00:00:00',
                ).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                workout
              </Text>
              <Text style={styles.redemptionSubtext}>
                {redemptionCountdown.hasStarted
                  ? `Complete it before ${redemptionCountdown.hoursRemaining}h ${redemptionCountdown.minutesRemaining}m to save your streak`
                  : `Deadline: ${new Date(activeRedemption.deadline).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              </Text>
            </>
          ) : // Unscheduled workout redemption
          redemptionCountdown.hasStarted ? (
            <>
              <Text style={styles.redemptionLabel}>
                ⚡ REDEMPTION MODE ACTIVE
              </Text>
              <Text style={styles.redemptionTimer}>
                {redemptionCountdown.hoursRemaining}h{' '}
                {redemptionCountdown.minutesRemaining}m left
              </Text>
              <Text style={styles.redemptionSubtext}>
                Complete any workout to save your streak
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.redemptionLabel}>⏰ REDEMPTION MODE</Text>
              <Text style={styles.redemptionTimer}>
                Starts in {redemptionCountdown.hoursToStart}h{' '}
                {redemptionCountdown.minutesToStart}m
              </Text>
              <Text style={styles.redemptionSubtext}>
                You’ll have 48 hours to complete a workout
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {todayWorkout && !currentWorkout && (
        <View style={styles.workoutTimeContainer}>
          <Text style={styles.workoutTimeLabel}>TODAY’S WORKOUT</Text>
          <Text style={styles.workoutTime}>{todayWorkout.time}</Text>
        </View>
      )}

      {!todayWorkout &&
        !currentWorkout &&
        !todayStatus.hasCompleted &&
        !todayStatus.hasSkipped && (
          <TouchableOpacity
            style={styles.workoutTimeContainer}
            onPress={handleOpenPlan}
          >
            <Text style={styles.workoutTimeLabel}>
              NO WORKOUT SCHEDULED TODAY
            </Text>
            <Text style={styles.planLink}>PLAN ONE →</Text>
          </TouchableOpacity>
        )}

      {currentWorkout && (
        <View style={styles.timerContainer}>
          <Text style={styles.timerLabel}>WORKOUT IN PROGRESS</Text>
          <Text style={styles.timerTime}>{formatTime(workoutTimer)}</Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        {!currentWorkout &&
        !todayStatus.hasCompleted &&
        !todayStatus.hasSkipped ? (
          <TourTarget id="home.start">
            <TouchableOpacity
              style={[styles.startButton, loading && styles.buttonDisabled]}
              onPress={handleStartWorkout}
              disabled={loading}
            >
              <Text style={styles.startButtonText}>
                {loading ? 'VERIFYING...' : 'START WORKOUT'}
              </Text>
            </TouchableOpacity>
          </TourTarget>
        ) : currentWorkout ? (
          <TouchableOpacity
            style={[styles.endButton, loading && styles.buttonDisabled]}
            onPress={handleEndWorkout}
            disabled={loading}
          >
            <Text style={styles.endButtonText}>
              {loading ? 'ENDING...' : 'END WORKOUT'}
            </Text>
          </TouchableOpacity>
        ) : todayStatus.hasCompleted ? (
          <View style={styles.completedWorkoutContainer}>
            <Text style={styles.completedWorkoutText}>
              ✅ WORKOUT COMPLETED
            </Text>
            <Text style={styles.completedWorkoutSubtext}>
              Great job! See you tomorrow! 💪
            </Text>
          </View>
        ) : todayStatus.hasSkipped ? (
          <View style={styles.skippedWorkoutBanner}>
            <View style={styles.skippedWorkoutContent}>
              <Text style={styles.skippedWorkoutText}>Workout Skipped</Text>
              <Text style={styles.skippedWorkoutReason}>
                “{todayStatus.skipReason}”
              </Text>
            </View>
          </View>
        ) : null}

        <TourTarget id="home.excuse">
          <TouchableOpacity
            style={[
              styles.excuseButton,
              (!todayWorkout ||
                todayStatus.hasCompleted ||
                todayStatus.hasSkipped ||
                currentWorkout ||
                activeRedemption) &&
                styles.buttonDisabled,
            ]}
            onPress={
              !todayStatus.hasCompleted &&
              !todayStatus.hasSkipped &&
              todayWorkout &&
              !currentWorkout
                ? handleMakeExcuse
                : () => {
                    if (currentWorkout) {
                      Alert.alert(
                        'Workout In Progress! 💪',
                        'You cannot make an excuse while your workout is in progress! Finish what you started!',
                      );
                    } else if (todayStatus.hasCompleted) {
                      Alert.alert(
                        'No Excuses Needed! 🔥',
                        "You already completed your workout today! Champions don't make excuses after crushing it!",
                      );
                    } else if (todayStatus.hasSkipped) {
                      Alert.alert(
                        'Already Skipped! 🤷‍♂️',
                        'You already made your excuse for today. One excuse per day is the limit!',
                      );
                    } else {
                      Alert.alert(
                        'No Workout Scheduled',
                        'You can only make excuses when you have a workout scheduled for today.',
                      );
                    }
                  }
            }
          >
            <Text style={styles.excuseButtonText}>MAKE EXCUSE</Text>
          </TouchableOpacity>
        </TourTarget>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 40,
  },
  headerSide: {
    width: 40,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    flex: 1,
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
  },
  planLink: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.cyan,
  },
  streakContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  recapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: -24,
    marginBottom: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recapText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.text,
  },
  recapLink: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.accent,
  },
  streakTarget: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  streakLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 8,
  },
  streakNumber: {
    fontFamily: fonts.numericHeavy,
    fontSize: 72,
    color: colors.accent,
    minWidth: 120,
    textAlign: 'center',
  },
  streakEmoji: {
    fontSize: 32,
    marginTop: 8,
  },
  workoutTimeContainer: {
    alignItems: 'center',
    marginBottom: 40,
    paddingHorizontal: 32,
  },
  workoutTimeLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 8,
  },
  workoutTime: {
    fontFamily: fonts.numeric,
    fontSize: 24,
    color: colors.cyan,
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 40,
    paddingHorizontal: 32,
  },
  timerLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 8,
  },
  timerTime: {
    fontFamily: fonts.numeric,
    fontSize: 36,
    color: colors.accent,
  },
  buttonContainer: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
    gap: 16,
  },
  startButton: {
    backgroundColor: colors.accent,
    paddingVertical: 20,
    borderRadius: 12,
    marginBottom: 8,
  },
  startButtonText: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.bg,
    textAlign: 'center',
  },
  endButton: {
    backgroundColor: colors.danger,
    paddingVertical: 20,
    borderRadius: 12,
    marginBottom: 8,
  },
  endButtonText: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
  },
  excuseButton: {
    backgroundColor: colors.danger,
    paddingVertical: 16,
    borderRadius: 12,
  },
  excuseButtonText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  completedWorkoutContainer: {
    backgroundColor: colors.accent,
    paddingVertical: 20,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  completedWorkoutText: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.bg,
    textAlign: 'center',
  },
  completedWorkoutSubtext: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.bg,
    textAlign: 'center',
    marginTop: 4,
  },
  skippedWorkoutBanner: {
    backgroundColor: 'rgba(188, 143, 129, 0.9)', // Soft terracotta with transparency
    marginHorizontal: -32, // Extend to screen edges
    paddingHorizontal: 32,
    paddingVertical: 16,
    marginBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(160, 120, 108, 0.3)',
  },
  skippedWorkoutContent: {
    alignItems: 'center',
  },
  skippedWorkoutText: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  skippedWorkoutReason: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
    opacity: 0.85,
    fontStyle: 'italic',
  },
  freezeTokensContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  freezeTokensLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  freezeTokensNumber: {
    fontFamily: fonts.numeric,
    fontSize: 18,
    color: colors.cyan,
  },
  redemptionContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)', // Ultra subtle translucent white
    backdropFilter: 'blur(20px)',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  redemptionLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
    opacity: 0.85,
  },
  redemptionTimer: {
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  redemptionSubtext: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 17,
    opacity: 0.7,
  },
});
