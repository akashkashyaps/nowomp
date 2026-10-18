import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaceList } from '@/components/places/PlaceList';
import type { Place } from '@/services/PlaceService';
import { colors, fonts } from '@/constants/theme';

/** Onboarding step 2: add at least one place before entering the app. */
export default function WorkoutLocationsScreen() {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);
  const onChange = useCallback((places: Place[]) => setCount(places.length), []);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>WHERE DO YOU TRAIN?</Text>
        <Text style={styles.subtitle}>
          Add your gym, your home, or where you play sport. Sessions only count when you start them
          at one of your places. Add more any time in Settings.
        </Text>

        <PlaceList onChange={onChange} />

        <TouchableOpacity
          style={[styles.continueButton, count === 0 && styles.disabled]}
          onPress={() => router.replace('/(tabs)')}
          disabled={count === 0}
        >
          <Text style={styles.continueText}>{count === 0 ? 'ADD A PLACE TO CONTINUE' : 'CONTINUE TO APP'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 16 },
  title: { fontFamily: fonts.heading, fontSize: 28, color: colors.accent, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  continueButton: { backgroundColor: colors.accent, paddingVertical: 18, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  continueText: { fontFamily: fonts.heading, fontSize: 15, color: colors.bg },
  disabled: { opacity: 0.4 },
});
