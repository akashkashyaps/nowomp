import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BackgroundReliabilityService } from '@/services/BackgroundReliabilityService';
import { colors, fonts } from '@/constants/theme';

/**
 * Explains, once, that this phone's maker kills background apps, and opens
 * the settings that fix it. `onDone` hides it (the You tab card); in
 * Settings it is shown without a Done button as a permanent shortcut.
 */
export function BackgroundReliabilityCard({ onDone }: { onDone?: () => void }) {
  const advice = BackgroundReliabilityService.advice();
  if (!advice) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🔋 Keep reminders working</Text>
      <Text style={styles.body}>
        {`${advice.name} phones stop apps running in the background, which silences workout reminders and freezes the widget. In NoWomp's settings, set:`}
      </Text>
      {advice.steps.map((s) => (
        <Text key={s} style={styles.step}>
          • {s}
        </Text>
      ))}
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.primary} onPress={() => BackgroundReliabilityService.openAppSettings()}>
          <Text style={styles.primaryText}>OPEN APP SETTINGS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={() => BackgroundReliabilityService.openBatterySettings()}>
          <Text style={styles.secondaryText}>BATTERY</Text>
        </TouchableOpacity>
      </View>
      {onDone && (
        <TouchableOpacity
          onPress={async () => {
            await BackgroundReliabilityService.markDone();
            onDone();
          }}
          style={styles.done}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.doneText}>DONE, HIDE THIS</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cyan,
    gap: 6,
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cyan },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  step: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 6 },
  primary: { flex: 1, backgroundColor: colors.cyan, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.bg },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  done: { alignSelf: 'center', marginTop: 4 },
  doneText: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, color: colors.textDim },
});
