import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExcuseSubmissionService } from '@/services/ExcuseSubmissionService';
import { RedemptionWorkoutService } from '@/services/RedemptionWorkoutService';
import { AlertCircle } from 'lucide-react-native';
import { EXCUSE_LABELS } from '@/constants/excuses';
import { AchievementService } from '@/services/AchievementService';

import { colors, fonts } from '@/constants/theme';
const EXCUSE_OPTIONS = EXCUSE_LABELS;

export default function MandatoryExcuseScreen() {
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date: string }>();

  const [selectedExcuse, setSelectedExcuse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleSubmit = async () => {
    if (!selectedExcuse) {
      Alert.alert('Select Excuse', 'Please select an excuse for missing your workout');
      return;
    }

    setLoading(true);
    try {
      // Records the excuse for the missed date and applies its consequence.
      const result = await ExcuseSubmissionService.recordExcuse(selectedExcuse, date);

      try {

        // Build success message based on result
        let message = 'Excuse submitted for ' + formatDate(date!) + '.';

        if (result.freezeUsed) {
          message += '\n\n🧊 Freeze token used - your streak is protected!';
        } else if (result.redemptionTriggered) {
          // Fetch redemption details to show appropriate message
          const redemption = await RedemptionWorkoutService.getActiveRedemptionWorkout();

          if (redemption?.redemption_type === 'next_scheduled' && redemption.target_workout_date) {
            const targetDate = new Date(redemption.target_workout_date + 'T00:00:00');
            const formattedTarget = targetDate.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric'
            });
            const deadline = new Date(redemption.deadline);
            const formattedDeadline = deadline.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            });

            message += '\n\n✅ GOOD NEWS\n\nYou have a workout scheduled for ' + formattedTarget + '.\n\nComplete that workout ON TIME to save your streak.\n\n⏰ Deadline: ' + formattedDeadline + '\n\nNote: This workout will count as your redemption - it won\'t increase your streak, just preserve it.';
          } else {
            message += '\n\n🔄 REDEMPTION MODE ACTIVE\n\nYou don\'t have any workouts scheduled in the next 48 hours.\n\nComplete ANY workout before the deadline to save your streak.\n\n⏰ You have 48 hours starting tomorrow\n\nThis workout won\'t increase your streak, just preserve it.';
          }
        } else if (await RedemptionWorkoutService.getActiveRedemptionWorkout()) {
          // Excuses are blocked during redemption, so this one changes nothing.
          message += "\n\n🔄 You're still in redemption. This excuse doesn't count. Finish your redemption workout before the deadline to save your streak.";
        } else {
          message += '\n\n💔 Your streak has been reset.';
        }

        // Excuses can unlock Hall of Shame trophies; the celebration overlay
        // announces them once this alert is dismissed.
        AchievementService.evaluate();

        Alert.alert(
          'Excuse Submitted',
          message,
          [
            {
              text: 'OK',
              onPress: () => router.replace('/(tabs)'),
            }
          ]
        );
      } catch (excuseError) {
        console.warn('Could not build the excuse summary:', excuseError);

        // The excuse is saved either way; only the summary failed.
        Alert.alert(
          'Excuse Submitted',
          'Your excuse has been logged.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/(tabs)'),
            }
          ]
        );
      }
    } catch (error: any) {
      console.error('Error submitting excuse:', error);
      Alert.alert('Error', error.message || 'Failed to submit excuse');
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <AlertCircle size={64} color={colors.danger} strokeWidth={2} />
          <Text style={styles.title}>APP LOCKED</Text>
          <Text style={styles.subtitle}>
            You missed your scheduled workout
          </Text>
          <Text style={styles.date}>{formatDate(date!)}</Text>
        </View>

        {/* Warning Message */}
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            You must provide an excuse before you can use the app again.
          </Text>
        </View>

        {/* Instruction */}
        <Text style={styles.instruction}>Pick your excuse:</Text>

        {/* Excuse Options */}
        <View style={styles.excuseContainer}>
          {EXCUSE_OPTIONS.map((excuse) => (
            <TouchableOpacity
              key={excuse}
              style={[
                styles.excuseButton,
                selectedExcuse === excuse && styles.excuseButtonSelected,
                loading && styles.buttonDisabled
              ]}
              onPress={() => setSelectedExcuse(excuse)}
              disabled={loading}
            >
              <Text style={[
                styles.excuseButtonText,
                selectedExcuse === excuse && styles.excuseButtonTextSelected
              ]}>
                {excuse}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, (loading || !selectedExcuse) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading || !selectedExcuse}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'SUBMITTING...' : 'SUBMIT EXCUSE'}
          </Text>
        </TouchableOpacity>

        {/* Info Text */}
        <Text style={styles.infoText}>
          After submitting, freeze tokens or redemption mode will be applied automatically if available.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 32,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: colors.danger,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  date: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    marginTop: 8,
  },
  warningBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.danger,
    marginBottom: 32,
  },
  warningText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.accent,
    marginBottom: 16,
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  typeButtonSelected: {
    borderColor: colors.accent,
    backgroundColor: '#1A2A0F',
  },
  typeEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  typeLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.textMuted,
  },
  typeLabelSelected: {
    color: colors.accent,
  },
  textInput: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    minHeight: 120,
  },
  submitButton: {
    backgroundColor: colors.accent,
    paddingVertical: 18,
    borderRadius: 12,
    marginBottom: 16,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.bg,
    textAlign: 'center',
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 18,
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
    backgroundColor: '#2A1A1A',
    borderColor: colors.danger,
  },
  excuseButtonText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  excuseButtonTextSelected: {
    color: colors.danger,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
