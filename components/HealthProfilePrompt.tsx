import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { UserCog, X } from 'lucide-react-native';
import { colors, fonts } from '@/constants/theme';
import {
  HealthProfileService,
  tanakaMaxHr,
  nsfSleepNeedMinutes,
  type HealthProfile,
} from '@/services/HealthProfileService';
import type { BiologicalSex } from '@/database/database';

interface HealthProfilePromptProps {
  profile: HealthProfile;
  onSaved: () => void;
}

const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: 'male', label: 'MALE' },
  { value: 'female', label: 'FEMALE' },
];

/**
 * Collects the inputs the health formulas need rather than silently assuming
 * them. Shown whenever something is missing; each field states what it improves
 * and what value is being used in the meantime, so nothing is a hidden default.
 */
export function HealthProfilePrompt({ profile, onSaved }: HealthProfilePromptProps) {
  const [expanded, setExpanded] = useState(false);
  const [age, setAge] = useState(profile.age != null ? String(profile.age) : '');
  const [sex, setSex] = useState<BiologicalSex>(profile.biologicalSex);
  const [sleepGoalH, setSleepGoalH] = useState(
    profile.sleepGoalIsEstimated ? '' : (profile.sleepGoalMin / 60).toFixed(1)
  );
  const [saving, setSaving] = useState(false);

  // Max HR is deliberately not asked for — almost nobody has a lab-measured
  // value, so the Tanaka age estimate is the practical best option.
  const missingCount = [
    profile.missing.age,
    profile.missing.biologicalSex,
    profile.missing.sleepGoal,
  ].filter(Boolean).length;

  const handleSave = async () => {
    const parsedAge = age.trim() === '' ? null : parseInt(age.trim(), 10);
    if (parsedAge !== null && (isNaN(parsedAge) || parsedAge < 13 || parsedAge > 100)) {
      Alert.alert('Invalid age', 'Enter an age between 13 and 100, or leave it blank.');
      return;
    }

    const parsedGoal =
      sleepGoalH.trim() === '' ? null : Math.round(parseFloat(sleepGoalH.trim()) * 60);
    if (parsedGoal !== null && (isNaN(parsedGoal) || parsedGoal < 240 || parsedGoal > 720)) {
      Alert.alert('Invalid sleep goal', 'Enter between 4 and 12 hours, or leave it blank.');
      return;
    }

    setSaving(true);
    try {
      await HealthProfileService.updateProfile({
        age: parsedAge,
        biologicalSex: sex === 'unspecified' ? null : sex,
        sleepGoalMin: parsedGoal,
      });
      setExpanded(false);
      onSaved();
    } catch {
      Alert.alert('Error', 'Could not save your health profile.');
    } finally {
      setSaving(false);
    }
  };

  if (!expanded) {
    if (missingCount === 0) return null;
    return (
      <TouchableOpacity style={styles.collapsed} onPress={() => setExpanded(true)}>
        <UserCog size={16} color={colors.warn} strokeWidth={2.5} />
        <Text style={styles.collapsedText}>
          ADD {missingCount} DETAIL{missingCount > 1 ? 'S' : ''} TO IMPROVE ACCURACY
        </Text>
      </TouchableOpacity>
    );
  }

  const previewMaxHr =
    age.trim() !== '' && !isNaN(parseInt(age.trim(), 10))
      ? tanakaMaxHr(parseInt(age.trim(), 10))
      : null;
  const previewSleep =
    age.trim() !== '' && !isNaN(parseInt(age.trim(), 10))
      ? nsfSleepNeedMinutes(parseInt(age.trim(), 10)) / 60
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <UserCog size={18} color={colors.accent} strokeWidth={2.5} />
          <Text style={styles.headerTitle}>HEALTH PROFILE</Text>
        </View>
        <TouchableOpacity onPress={() => setExpanded(false)} hitSlop={10}>
          <X size={18} color={colors.textFaint} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <Text style={styles.intro}>
        These are optional. Each one replaces an assumption with your real number.
      </Text>

      {/* Age */}
      <Text style={styles.label}>AGE</Text>
      <Text style={styles.help}>
        Sets your max heart rate via the Tanaka formula (208 − 0.7 × age) and your
        sleep target from the National Sleep Foundation age bands.
        {previewMaxHr != null
          ? ` At ${age}, that's ${previewMaxHr} bpm and ${previewSleep}h.`
          : ' Without it we assume a 35-year-old adult.'}
      </Text>
      <TextInput
        style={styles.input}
        value={age}
        onChangeText={setAge}
        placeholder="e.g. 28"
        placeholderTextColor={colors.textFaint}
        keyboardType="number-pad"
        maxLength={3}
      />

      {/* Biological sex */}
      <Text style={styles.label}>BIOLOGICAL SEX</Text>
      <Text style={styles.help}>
        Training load (TRIMP) uses different lactate-response curves for males and
        females. Without it we use the male curve.
      </Text>
      <View style={styles.segmented}>
        {SEX_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segment, sex === opt.value && styles.segmentActive]}
            onPress={() => setSex(sex === opt.value ? 'unspecified' : opt.value)}
          >
            <Text
              style={[
                styles.segmentText,
                sex === opt.value && styles.segmentTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sleep goal */}
      <Text style={styles.label}>SLEEP GOAL (HOURS)</Text>
      <Text style={styles.help}>
        Your personal nightly target. Leave blank to use the recommendation for
        your age.
      </Text>
      <TextInput
        style={styles.input}
        value={sleepGoalH}
        onChangeText={setSleepGoalH}
        placeholder={previewSleep != null ? `e.g. ${previewSleep}` : 'e.g. 8'}
        placeholderTextColor={colors.textFaint}
        keyboardType="decimal-pad"
        maxLength={4}
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveText}>{saving ? 'SAVING...' : 'SAVE PROFILE'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.warn,
    padding: 12,
    marginBottom: 20,
  },
  collapsedText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.warn,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.text,
  },
  intro: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginBottom: 16,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 1,
    marginTop: 12,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  segmented: {
    flexDirection: 'row',
    gap: 10,
  },
  segment: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  segmentActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  segmentText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  segmentTextActive: {
    color: colors.bg,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
    letterSpacing: 0.5,
  },
});
