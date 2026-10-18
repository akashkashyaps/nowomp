import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SkipService } from '@/services/SkipService';
import { ExcuseSubmissionService } from '@/services/ExcuseSubmissionService';
import { FreezeTokenService } from '@/services/FreezeTokenService';
import { RedemptionWorkoutService } from '@/services/RedemptionWorkoutService';
import { ExcuseMessageService } from '@/services/ExcuseMessageService';
import ExcuseMotivationModal from '@/components/ExcuseMotivationModal';
import { EXCUSE_LABELS } from '@/constants/excuses';
import { AchievementService } from '@/services/AchievementService';

import { colors, fonts } from '@/constants/theme';
const EXCUSE_OPTIONS = EXCUSE_LABELS;

export default function ExcuseScreen() {
  const [selectedExcuse, setSelectedExcuse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasAlreadySkipped, setHasAlreadySkipped] = useState(false);
  const [todayExcuse, setTodayExcuse] = useState<string | null>(null);
  const [availableTokens, setAvailableTokens] = useState(0);
  const [showMotivationModal, setShowMotivationModal] = useState(false);
  const [motivationalMessage, setMotivationalMessage] = useState<{title: string; message: string} | null>(null);
  const [pendingExcuse, setPendingExcuse] = useState<string | null>(null);

  useEffect(() => {
    checkTodaySkip();
    loadTokenCount();
  }, []);

  const checkTodaySkip = async () => {
    try {
      const hasSkipped = await SkipService.hasSkippedToday();
      setHasAlreadySkipped(hasSkipped);

      if (hasSkipped) {
        const skip = await SkipService.getTodaySkip();
        setTodayExcuse(skip?.excuse || null);
      }
    } catch (error) {
      console.error('Error checking today skip:', error);
    }
  };

  const loadTokenCount = async () => {
    try {
      const count = await FreezeTokenService.getAvailableTokenCount();
      setAvailableTokens(count);
    } catch (error) {
      console.error('Error loading token count:', error);
      setAvailableTokens(0); // Set to 0 if freeze system is not working
    }
  };

  const handleExcuseSelect = async (excuse: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (hasAlreadySkipped) {
      Alert.alert(
        '🙄 REALLY?',
        'You already made an excuse today! One excuse per day is more than enough.',
        [{ text: 'Fine...', style: 'destructive' }]
      );
      return;
    }

    setSelectedExcuse(excuse);
    setLoading(true);

    try {
      // Try to get motivational message for this excuse directly
      const message = await ExcuseMessageService.getMotivationalMessage(excuse, 'other');

      // Store the pending excuse details
      setPendingExcuse(excuse);
      setMotivationalMessage(message);
      setShowMotivationModal(true);
      setLoading(false);
    } catch (error) {
      console.error('Error getting motivational message:', error);

      // Fallback: try to get test message without database
      try {
        const testMessage = ExcuseMessageService.getTestMessage(excuse);
        if (testMessage) {
          console.log('Using test message:', testMessage);
          setPendingExcuse(excuse);
          setMotivationalMessage(testMessage);
          setShowMotivationModal(true);
          setLoading(false);
        } else {
          throw new Error('No test message available');
        }
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        setLoading(false);
        Alert.alert('Error', 'Failed to load motivational message. Please try again.');
      }
    }
  };

  const handleKeepExcuse = async () => {
    if (!pendingExcuse) return;

    setShowMotivationModal(false);
    setLoading(true);

    try {
      // Records the excuse and applies its consequence (freeze token or redemption).
      const result = await ExcuseSubmissionService.recordExcuse(pendingExcuse);

      let title = '😔 EXCUSE LOGGED';
      let message = 'Another day, another excuse. Your future self is disappointed.';

      {

        if (result.freezeUsed) {
          title = '🧊 FREEZE TOKEN USED';
          message = 'Your streak is protected! A freeze token was automatically applied.\n\nDon\'t make this a habit though.';
        } else if (result.redemptionTriggered) {
          const redemption = await RedemptionWorkoutService.getActiveRedemptionWorkout();

          if (redemption?.redemption_type === 'next_scheduled' && redemption.target_workout_date) {
            const targetDate = new Date(redemption.target_workout_date + 'T00:00:00');
            const formattedTarget = targetDate.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric'
            });
            title = '🔄 REDEMPTION MODE';
            message = `Complete your scheduled workout on ${formattedTarget} to save your streak.\n\nThis workout won't increase your streak, just preserve it.`;
          } else {
            title = '🔄 REDEMPTION MODE';
            message = 'Complete ANY workout within 48 hours (starting tomorrow) to save your streak.\n\nThis workout won\'t increase your streak, just preserve it.';
          }
        }
      }

      // Excuses can unlock Hall of Shame trophies; the celebration overlay
      // announces them once this alert is dismissed.
      AchievementService.evaluate();

      Alert.alert(
        title,
        message,
        [
          {
            text: "I'll do better tomorrow",
            onPress: () => router.back(),
            style: 'destructive'
          }
        ]
      );
    } catch (error) {
      console.error('Error saving excuse:', error);
      Alert.alert('Error', (error as Error).message || 'Failed to save excuse');
      setLoading(false);
    }

    // Reset state
    setPendingExcuse(null);
    setMotivationalMessage(null);
  };

  const handleGoToGym = () => {
    setShowMotivationModal(false);

    // Reset state
    setPendingExcuse(null);
    setMotivationalMessage(null);
    setSelectedExcuse(null);

    // Success message and go back
    Alert.alert(
      '🎉 EXCELLENT CHOICE!',
      'You chose strength over excuses. Your future self thanks you! Now get to that gym!',
      [
        {
          text: "LET'S GO!",
          onPress: () => router.back(),
          style: 'default'
        }
      ]
    );
  };

  const handleCloseModal = () => {
    setShowMotivationModal(false);
    setPendingExcuse(null);
    setMotivationalMessage(null);
    setLoading(false);
  };

  const handleGoBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  if (hasAlreadySkipped) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.emoji}>🤐</Text>
          <Text style={styles.title}>EXCUSE ALREADY MADE</Text>
          <Text style={styles.subtitle}>ONE PER DAY IS THE LIMIT</Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.alreadySkippedContainer}>
            <Text style={styles.alreadySkippedTitle}>Today’s Excuse:</Text>
            <View style={styles.todayExcuseBox}>
              <Text style={styles.todayExcuseText}>“{todayExcuse}”</Text>
            </View>

            <Text style={styles.shameText}>
              You’ve already used your daily excuse. Even we have limits to our patience.
              Come back tomorrow if you want to disappoint us again.
            </Text>
          </View>

          <TouchableOpacity 
            style={styles.backButton}
            onPress={handleGoBack}
          >
            <Text style={styles.backButtonText}>BACK TO REALITY</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.emoji}>😔</Text>
        <Text style={styles.title}>SO YOU’VE DECIDED</Text>
        <Text style={styles.subtitle}>TO MAKE AN EXCUSE TODAY...</Text>
        
        {availableTokens > 0 && (
          <View style={styles.freezeTokenBadge}>
            <Text style={styles.freezeTokenText}>❄️ {availableTokens} FREEZE TOKENS</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.instruction}>Pick your excuse:</Text>

        <View style={styles.excuseContainer}>
          {EXCUSE_OPTIONS.map((excuse, index) => (
            <TouchableOpacity
              key={excuse}
              style={[
                styles.excuseButton,
                selectedExcuse === excuse && styles.excuseButtonSelected,
                loading && styles.buttonDisabled
              ]}
              onPress={() => handleExcuseSelect(excuse)}
              disabled={loading}
            >
              <Text style={styles.excuseButtonText}>{excuse}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <Text style={styles.backButtonText}>
            “ACTUALLY, I’LL GO TO THE GYM”
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Motivational Modal */}
      {motivationalMessage && (
        <ExcuseMotivationModal
          visible={showMotivationModal}
          message={motivationalMessage}
          onKeepExcuse={handleKeepExcuse}
          onGoToGym={handleGoToGym}
          onClose={handleCloseModal}
        />
      )}
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
    alignItems: 'center',
    paddingHorizontal: 32,
    marginBottom: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.danger,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  instruction: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  excuseContainer: {
    gap: 12,
    marginBottom: 32,
  },
  excuseButton: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  excuseButtonSelected: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  excuseButtonText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 40,
  },
  backButtonText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.bg,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  alreadySkippedContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  alreadySkippedTitle: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 16,
  },
  todayExcuseBox: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  todayExcuseText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  shameText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  freezeTokenBadge: {
    backgroundColor: colors.cyan,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 16,
    alignSelf: 'center',
  },
  freezeTokenText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.bg,
    textAlign: 'center',
  },
  categoryContainer: {
    gap: 16,
    marginBottom: 32,
  },
  categoryButton: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
  },
  medicalButton: {
    backgroundColor: '#1A4B3A',
    borderColor: '#2D7A5A',
  },
  emergencyButton: {
    backgroundColor: '#4B1A1A',
    borderColor: '#7A2D2D',
  },
  otherButton: {
    backgroundColor: '#1A1A4B',
    borderColor: '#2D2D7A',
  },
  categoryButtonText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  categoryDescription: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});