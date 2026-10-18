import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';
export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ 
      headerShown: false,
      contentStyle: { backgroundColor: colors.bg }
    }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="workout-locations" />
    </Stack>
  );
}