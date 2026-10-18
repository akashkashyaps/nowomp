import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/constants/theme';

/**
 * Web build of the health tab. Health Connect is Android-only, so this exists to
 * keep the tab bar identical across platforms rather than making a tab appear
 * and disappear.
 */
export default function HealthWebScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>HEALTH</Text>
      </View>
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 86 }}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>HEALTH CONNECT IS ANDROID ONLY</Text>
          <Text style={styles.cardBody}>
            Open NoWomp on your Android phone to see your recovery, sleep and
            training data.
          </Text>
        </View>
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
    paddingTop: 60,
    paddingHorizontal: 32,
    paddingBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: colors.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
  },
  cardBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
