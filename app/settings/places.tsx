import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PlaceList } from '@/components/places/PlaceList';
import { colors, fonts } from '@/constants/theme';

export default function PlacesScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <ScreenHeader title="PLACES" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.intro}>
          Start a session at any of these and it counts. Gym and home are workouts. Sport keeps your
          streak too, but is counted on its own.
        </Text>
        <PlaceList />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 16 },
  intro: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
});
