import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { NotebookPen, Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { colors, fonts } from '@/constants/theme';
import { DailyJournalService } from '@/services/DailyJournalService';
import type { DailyJournal } from '@/database/database';

interface DailyJournalCardProps {
  onSaved: () => void;
}

const STRESS_LABELS = ['CALM', 'LOW', 'OK', 'HIGH', 'MAXED'];

/**
 * Optional daily context: food, alcohol, caffeine, stress.
 *
 * Collapsed by default — this is a nice-to-have, and a large always-open form
 * would dominate a screen that is mostly automatic. Everything is optional and
 * saved independently.
 */
export function DailyJournalCard({ onSaved }: DailyJournalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [entry, setEntry] = useState<DailyJournal | null>(null);
  const [food, setFood] = useState('');
  const [lastMeal, setLastMeal] = useState('');
  const [alcohol, setAlcohol] = useState('');
  const [caffeine, setCaffeine] = useState('');
  const [stress, setStress] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    DailyJournalService.getForDate()
      .then((e) => {
        if (!e) return;
        setEntry(e);
        setFood(e.food_notes ?? '');
        setLastMeal(e.last_meal_time ?? '');
        setAlcohol(e.alcohol_units != null ? String(e.alcohol_units) : '');
        setCaffeine(e.caffeine_servings != null ? String(e.caffeine_servings) : '');
        setStress(e.stress_level ?? null);
        setNotes(e.notes ?? '');
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    const num = (v: string) => (v.trim() === '' ? null : parseFloat(v.trim()));

    const alcoholVal = num(alcohol);
    if (alcoholVal !== null && (isNaN(alcoholVal) || alcoholVal < 0 || alcoholVal > 50)) {
      Alert.alert('Invalid amount', 'Enter a number of drinks between 0 and 50.');
      return;
    }
    const caffeineVal = num(caffeine);
    if (caffeineVal !== null && (isNaN(caffeineVal) || caffeineVal < 0 || caffeineVal > 30)) {
      Alert.alert('Invalid amount', 'Enter a number of servings between 0 and 30.');
      return;
    }

    setSaving(true);
    try {
      await DailyJournalService.upsert({
        food_notes: food.trim() === '' ? null : food.trim(),
        last_meal_time: lastMeal.trim() === '' ? null : lastMeal.trim(),
        alcohol_units: alcoholVal,
        caffeine_servings: caffeineVal,
        stress_level: stress,
        notes: notes.trim() === '' ? null : notes.trim(),
      } as Partial<DailyJournal>);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      onSaved();
    } catch {
      Alert.alert('Error', 'Could not save your journal entry.');
    } finally {
      setSaving(false);
    }
  };

  const hasEntry =
    entry != null &&
    (entry.food_notes != null ||
      entry.alcohol_units != null ||
      entry.caffeine_servings != null ||
      entry.stress_level != null ||
      entry.notes != null);

  if (!expanded) {
    return (
      <TouchableOpacity style={styles.collapsed} onPress={() => setExpanded(true)}>
        <View style={styles.collapsedHeader}>
          <NotebookPen
            size={16}
            color={hasEntry ? colors.accent : colors.textFaint}
            strokeWidth={2.5}
          />
          <Text style={[styles.collapsedText, hasEntry && { color: colors.accent }]}>
            {hasEntry ? "TODAY'S JOURNAL LOGGED — TAP TO EDIT" : "LOG TODAY'S JOURNAL"}
          </Text>
          <ChevronDown size={14} color={colors.textFaint} strokeWidth={2.5} />
        </View>
        <Text style={styles.collapsedSub}>
          {hasEntry
            ? 'Your analysis prompt will use this to explain your numbers, not guess at them.'
            : 'Food, alcohol, caffeine and stress make your analysis personal — without them an AI has to assume.'}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <NotebookPen size={18} color={colors.accent} strokeWidth={2.5} />
          <Text style={styles.headerTitle}>TODAY’S JOURNAL</Text>
        </View>
        <TouchableOpacity onPress={() => setExpanded(false)} hitSlop={12}>
          <ChevronUp size={18} color={colors.textFaint} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <Text style={styles.intro}>
        All optional, but this is what makes your analysis personal. Your phone
        records how your body responded; only you know what caused it. Without
        this, an AI can describe your numbers but has to guess at the reasons —
        with it, your prompt explains them instead of assuming.
      </Text>

      <Text style={styles.label}>WHAT DID YOU EAT?</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={food}
        onChangeText={setFood}
        placeholder="Rough notes are fine — e.g. oats, chicken salad, pizza late"
        placeholderTextColor={colors.textFaint}
        multiline
        // A multiline input inside a ScrollView swallows the scroll gesture on
        // Android unless it explicitly declines to handle it itself.
        scrollEnabled={false}
        textAlignVertical="top"
      />

      <Text style={styles.label}>LAST SUBSTANTIAL MEAL</Text>
      <Text style={styles.help}>
        Eating late keeps digestion running into the night, which raises heart
        rate and lowers HRV while you sleep.
      </Text>
      <TextInput
        style={styles.input}
        value={lastMeal}
        onChangeText={setLastMeal}
        placeholder="e.g. 21:30"
        placeholderTextColor={colors.textFaint}
        maxLength={5}
      />

      <View style={styles.pairRow}>
        <View style={styles.pairItem}>
          <Text style={styles.label}>ALCOHOL</Text>
          <TextInput
            style={styles.input}
            value={alcohol}
            onChangeText={setAlcohol}
            placeholder="drinks"
            placeholderTextColor={colors.textFaint}
            keyboardType="decimal-pad"
            maxLength={4}
          />
        </View>
        <View style={styles.pairItem}>
          <Text style={styles.label}>CAFFEINE</Text>
          <TextInput
            style={styles.input}
            value={caffeine}
            onChangeText={setCaffeine}
            placeholder="cups"
            placeholderTextColor={colors.textFaint}
            keyboardType="decimal-pad"
            maxLength={4}
          />
        </View>
      </View>

      <Text style={styles.label}>STRESS</Text>
      <View style={styles.stressRow}>
        {STRESS_LABELS.map((label, i) => {
          const value = i + 1;
          return (
            <TouchableOpacity
              key={label}
              style={[styles.stressChip, stress === value && styles.stressChipActive]}
              onPress={() => setStress(stress === value ? null : value)}
            >
              <Text
                style={[
                  styles.stressText,
                  stress === value && styles.stressTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>ANYTHING ELSE?</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Illness, travel, late night, injury..."
        placeholderTextColor={colors.textFaint}
        multiline
        // A multiline input inside a ScrollView swallows the scroll gesture on
        // Android unless it explicitly declines to handle it itself.
        scrollEnabled={false}
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.disabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {justSaved && <Check size={16} color={colors.bg} strokeWidth={2.5} />}
        <Text style={styles.saveText}>
          {saving ? 'SAVING...' : justSaved ? 'SAVED' : 'SAVE JOURNAL'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  collapsedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  collapsedText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  collapsedSub: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 8,
  },
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
    fontSize: 16,
    color: colors.text,
  },
  intro: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    marginBottom: 8,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 6,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
    lineHeight: 15,
    marginBottom: 6,
    marginTop: -2,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
  },
  multiline: {
    minHeight: 62,
    textAlignVertical: 'top',
  },
  pairRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pairItem: {
    flex: 1,
  },
  stressRow: {
    flexDirection: 'row',
    gap: 6,
  },
  stressChip: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    alignItems: 'center',
  },
  stressChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  stressText: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  stressTextActive: {
    color: colors.bg,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
  },
  disabled: {
    opacity: 0.5,
  },
  saveText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
    letterSpacing: 0.5,
  },
});
