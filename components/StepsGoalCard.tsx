import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Footprints, Pencil } from 'lucide-react-native';
import { colors, fonts } from '@/constants/theme';
import {
  HealthProfileService,
  STEP_GOAL_SUGGESTIONS,
} from '@/services/HealthProfileService';

interface StepsGoalCardProps {
  steps: number | null;
  goal: number | null;
  weeklyAverage: number | null;
  onGoalSet: () => void;
}

/**
 * Daily step progress against a user-chosen target.
 *
 * The goal is never assumed: until one is set the card asks for it, offering
 * research-backed options alongside a free-text field rather than silently
 * defaulting to the folkloric 10,000.
 */
export function StepsGoalCard({
  steps,
  goal,
  weeklyAverage,
  onGoalSet,
}: StepsGoalCardProps) {
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (value: number) => {
    if (!(value >= 500 && value <= 100000)) {
      Alert.alert('Invalid goal', 'Enter a step goal between 500 and 100,000.');
      return;
    }
    setSaving(true);
    try {
      await HealthProfileService.updateProfile({ stepsGoal: value });
      setEditing(false);
      setCustom('');
      onGoalSet();
    } catch {
      Alert.alert('Error', 'Could not save your step goal.');
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------ goal picker
  if (goal == null || editing) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Footprints size={18} color={colors.accent} strokeWidth={2.5} />
          <Text style={styles.headerTitle}>SET YOUR STEP GOAL</Text>
        </View>

        <Text style={styles.help}>
          Pick a daily target. Research on step count and mortality finds the benefit
          curve flattens around 8,000 steps under 60, and around 6,000 over 60.
          {weeklyAverage != null
            ? ` You have averaged ${Math.round(weeklyAverage).toLocaleString()} over the past week.`
            : ''}
        </Text>

        <View style={styles.optionGrid}>
          {STEP_GOAL_SUGGESTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.option, goal === opt.value && styles.optionActive]}
              onPress={() => save(opt.value)}
              disabled={saving}
            >
              <Text
                style={[
                  styles.optionValue,
                  goal === opt.value && styles.optionValueActive,
                ]}
              >
                {opt.label}
              </Text>
              <Text style={styles.optionNote}>{opt.note}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.customRow}>
          <TextInput
            style={styles.input}
            value={custom}
            onChangeText={setCustom}
            placeholder="Custom"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            maxLength={6}
          />
          <TouchableOpacity
            style={[styles.saveButton, custom.trim() === '' && styles.disabled]}
            onPress={() => save(parseInt(custom.trim(), 10))}
            disabled={custom.trim() === '' || saving}
          >
            <Text style={styles.saveButtonText}>SET</Text>
          </TouchableOpacity>
        </View>

        {goal != null && (
          <TouchableOpacity onPress={() => setEditing(false)} style={styles.cancel}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // --------------------------------------------------------------- progress
  const current = steps ?? 0;
  const ratio = Math.min(1, current / goal);
  const size = 116;
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const remaining = Math.max(0, goal - current);
  const hit = current >= goal;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Footprints size={18} color={colors.accent} strokeWidth={2.5} />
        <Text style={styles.headerTitle}>STEPS</Text>
        <TouchableOpacity
          onPress={() => setEditing(true)}
          hitSlop={12}
          style={styles.editButton}
        >
          <Pencil size={14} color={colors.textFaint} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <View style={styles.progressRow}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={colors.border}
              strokeWidth={stroke}
              fill="none"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={hit ? colors.accent : colors.cyan}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - ratio)}
            />
          </Svg>
          <View style={styles.ringCenter} pointerEvents="none">
            <Text style={styles.ringPercent}>{Math.round(ratio * 100)}%</Text>
          </View>
        </View>

        <View style={styles.progressMeta}>
          <Text style={styles.stepsValue}>
            {steps != null ? current.toLocaleString() : '--'}
          </Text>
          <Text style={styles.stepsLabel}>OF {goal.toLocaleString()} STEPS</Text>
          <Text style={[styles.stepsHint, hit && { color: colors.accent }]}>
            {steps == null
              ? 'NO STEP DATA YET'
              : hit
              ? 'GOAL REACHED'
              : `${remaining.toLocaleString()} TO GO`}
          </Text>
          {weeklyAverage != null && (
            <Text style={styles.stepsAvg}>
              {Math.round(weeklyAverage).toLocaleString()} DAILY AVG THIS WEEK
            </Text>
          )}
        </View>
      </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  editButton: {
    padding: 4,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 16,
    marginBottom: 14,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  optionActive: {
    borderColor: colors.accent,
  },
  optionValue: {
    fontFamily: fonts.numericHeavy,
    fontSize: 16,
    color: colors.text,
  },
  optionValueActive: {
    color: colors.accent,
  },
  optionNote: {
    fontFamily: fonts.body,
    fontSize: 8,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: 3,
  },
  customRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.numeric,
    fontSize: 14,
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 22,
    justifyContent: 'center',
  },
  saveButtonText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    color: colors.bg,
    letterSpacing: 0.5,
  },
  disabled: {
    opacity: 0.4,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  cancelText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textFaint,
    letterSpacing: 1,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercent: {
    fontFamily: fonts.numericHeavy,
    fontSize: 22,
    color: colors.text,
  },
  progressMeta: {
    flex: 1,
    gap: 3,
  },
  stepsValue: {
    fontFamily: fonts.numericHeavy,
    fontSize: 26,
    color: colors.text,
  },
  stepsLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  stepsHint: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.cyan,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  stepsAvg: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.textFaint,
    marginTop: 2,
  },
});
