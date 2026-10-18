import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { HelpCircle, X } from 'lucide-react-native';
import { colors, fonts } from '@/constants/theme';

/**
 * Plain-language explanation of every score on this screen.
 *
 * The numbers here are computed against the user's own history rather than
 * population averages, which is not obvious and changes how they should be
 * read — a "62" means nothing without knowing it is relative to you.
 */

interface Entry {
  name: string;
  what: string;
  how: string;
}

const ENTRIES: Entry[] = [
  {
    name: 'Recovery',
    what: 'How ready your body looks for hard effort today, from 0 to 100.',
    how: "Built from last night's heart rate variability (55%), resting heart rate (25%) and sleep (20%). Each is compared with your own recent average, not anyone else's — so 70 means 'good for you', not 'good for a 30-year-old'. Green is 67+, yellow 34-66, red below 34.",
  },
  {
    name: 'HRV (heart rate variability)',
    what: 'The tiny variation in time between heartbeats, in milliseconds. Higher usually means better recovered.',
    how: 'Measured while you sleep. Normal values differ hugely between people, so the app only ever compares yours with your own 7-day average. A drop of a few ms is noise; a sustained drop is a signal.',
  },
  {
    name: 'Resting heart rate',
    what: 'Your heart rate at complete rest, in beats per minute. Lower is generally better.',
    how: "Taken from your device's own reading where it records one. If not, the app estimates it from your quietest heart rate overnight — or, failing that, the calmest part of your day.",
  },
  {
    name: 'Sleep performance',
    what: 'How much of the sleep you needed you actually got, as a percentage.',
    how: 'Your target starts from National Sleep Foundation guidance for your age, then adds time back if you slept short recently, plus a little more after a workout. 100% means you hit the target.',
  },
  {
    name: 'Sleep stages',
    what: 'Deep sleep restores the body; REM consolidates memory; light sleep is the rest.',
    how: 'Reported by your device, not measured by this app. Healthy adults typically get 13-23% deep and 20-25% REM. Consumer wearables estimate stages, so treat the split as a rough guide and the total as the reliable number.',
  },
  {
    name: 'Sleep consistency',
    what: 'How regular your bed and wake times are, from 0 to 100.',
    how: 'Measures how tightly your sleep timing clusters over the last two weeks. Going to bed at wildly different times scores low even if you sleep plenty — regularity matters on its own.',
  },
  {
    name: 'Heart rate zone minutes',
    what: 'Time spent working hard enough to train your heart.',
    how: "Minutes above 70% of your maximum heart rate during recorded workouts. Max HR is estimated as 208 minus 0.7 times your age, unless you've entered a measured value.",
  },
  {
    name: 'Steps, distance and calories',
    what: 'Your daily movement totals.',
    how: "Read straight from Health Connect — whatever your watch or phone recorded. Today's figures are partial until the day ends.",
  },
  {
    name: 'Journeys',
    what: 'Your lifetime walking distance, mapped onto real places.',
    how: 'Adds up every kilometre since you connected Health Connect and compares it with real routes and distances, from a marathon up to the Moon.',
  },
];

export function MetricsGuide() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity style={styles.button} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <HelpCircle size={14} color={colors.textMuted} strokeWidth={2.5} />
        <Text style={styles.buttonText}>WHAT DO THESE NUMBERS MEAN?</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>YOUR NUMBERS</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12}>
                <X size={22} color={colors.textMuted} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.intro}>
                Everything here is worked out on your phone from your own data, and
                compared against your own history rather than population averages.
              </Text>

              {ENTRIES.map((e) => (
                <View key={e.name} style={styles.entry}>
                  <Text style={styles.entryName}>{e.name}</Text>
                  <Text style={styles.entryWhat}>{e.what}</Text>
                  <Text style={styles.entryHow}>{e.how}</Text>
                </View>
              ))}

              <Text style={styles.disclaimer}>
                These are wellness estimates, not medical measurements. They are
                useful for spotting your own patterns over time — not for
                diagnosing anything.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignSelf: 'center',
  },
  buttonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    borderTopWidth: 2,
    borderColor: colors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.text,
  },
  scroll: {
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  intro: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 20,
  },
  entry: {
    marginBottom: 20,
  },
  entryName: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.accent,
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  entryWhat: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  entryHow: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
    lineHeight: 18,
    marginTop: 5,
  },
  disclaimer: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 17,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.card,
  },
});
