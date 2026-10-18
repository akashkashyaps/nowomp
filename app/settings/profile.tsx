import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UserService } from '@/services/UserService';
import { HealthProfileService } from '@/services/HealthProfileService';
import { colors, fonts } from '@/constants/theme';

/** Name and age, saved together with one button. */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [saved, setSaved] = useState({ name: '', age: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    UserService.getCurrentUser().then((u) => {
      if (!u) return;
      const a = u.age != null ? String(u.age) : '';
      setUserId(u.id);
      setName(u.display_name);
      setAge(a);
      setSaved({ name: u.display_name, age: a });
    });
  }, []);

  const changed = name.trim() !== saved.name || age.trim() !== saved.age;

  const save = async () => {
    if (!userId) return;
    if (!name.trim()) {
      Alert.alert('Name needed', 'Your name can’t be empty.');
      return;
    }
    // Blank clears the age and falls the app back to an estimated max HR.
    const trimmed = age.trim();
    const parsed = trimmed === '' ? null : parseInt(trimmed, 10);
    if (parsed !== null && (isNaN(parsed) || parsed < 13 || parsed > 100)) {
      Alert.alert('Invalid age', 'Enter an age between 13 and 100, or leave it blank.');
      return;
    }
    setSaving(true);
    try {
      if (name.trim() !== saved.name) await UserService.updateUser(userId, name.trim());
      if (trimmed !== saved.age) await HealthProfileService.updateProfile({ age: parsed });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save your profile.');
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="PROFILE" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>NAME</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={colors.textFaint}
          maxLength={30}
        />

        <Text style={styles.label}>AGE (OPTIONAL)</Text>
        <TextInput
          style={styles.input}
          value={age}
          onChangeText={setAge}
          placeholder="e.g. 28"
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
          maxLength={3}
        />
        <Text style={styles.note}>
          Sets your max heart rate and sleep target on the Health tab. Sex, sleep goal and measured
          max heart rate are on the Health tab itself.
        </Text>

        <TouchableOpacity style={[styles.save, (!changed || saving) && styles.disabled]} onPress={save} disabled={!changed || saving}>
          <Text style={styles.saveText}>{saving ? 'SAVING…' : 'SAVE'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 10 },
  label: { fontFamily: fonts.heading, fontSize: 14, color: colors.textMuted, marginTop: 10 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.text,
  },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, lineHeight: 17 },
  save: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  saveText: { fontFamily: fonts.heading, fontSize: 16, color: colors.bg },
  disabled: { opacity: 0.4 },
});
