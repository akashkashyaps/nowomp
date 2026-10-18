import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { BackgroundReliabilityCard } from '@/components/BackgroundReliabilityCard';
import { colors } from '@/constants/theme';

/** The phone-maker background-killing fix, as a permanent shortcut from Settings. */
export default function PhoneSetupScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <ScreenHeader title="REMINDERS" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <BackgroundReliabilityCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16 },
});
