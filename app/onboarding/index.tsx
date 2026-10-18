import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { UserService } from '@/services/UserService';

import { colors, fonts } from '@/constants/theme';
export default function OnboardingScreen() {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Display name is required');
      return;
    }

    setLoading(true);
    try {
      await UserService.createUser(displayName.trim());
      router.push('/onboarding/workout-locations');
    } catch (error) {
      console.error('Error creating user:', error);
      Alert.alert('Error', 'Failed to save user data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>NO EXCUSES.</Text>
        <Text style={styles.subtitle}>WHAT SHOULD WE CALL YOU?</Text>
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name"
            placeholderTextColor={colors.textFaint}
            maxLength={30}
          />
        </View>

        <TouchableOpacity 
          style={[styles.nextButton, loading && styles.buttonDisabled]}
          onPress={handleNext}
          disabled={loading || !displayName.trim()}
        >
          <Text style={styles.nextButtonText}>
            {loading ? 'SAVING...' : 'NEXT'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 36,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 48,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 32,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 18,
    fontFamily: fonts.bodySemi,
    color: colors.text,
    textAlign: 'center',
  },
  nextButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
  },
  nextButtonText: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.bg,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});