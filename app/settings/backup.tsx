import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, Upload } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ExportService } from '@/services/ExportService';
import { BackupReminderService } from '@/services/BackupReminderService';
import { colors, fonts } from '@/constants/theme';

export default function BackupScreen() {
  const insets = useSafeAreaInsets();
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  useEffect(() => {
    BackupReminderService.daysSinceBackup().then(setLastBackup).catch(() => {});
  }, []);

  const exportBackup = async () => {
    setBusy('export');
    try {
      await ExportService.exportAllData();
      await BackupReminderService.markBackedUp();
      setLastBackup(0);
      Alert.alert('Backup saved', 'Keep the file somewhere safe, off this phone.');
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', 'Failed to export backup');
    } finally {
      setBusy(null);
    }
  };

  const importBackup = async () => {
    setBusy('import');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0]) await ExportService.importData(result.assets[0].uri);
    } catch (error) {
      console.error('Import error:', error);
      Alert.alert('Error', 'Failed to import data');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="BACKUP" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>LAST BACKUP</Text>
          <Text style={styles.cardValue}>
            {lastBackup == null ? 'Never' : lastBackup === 0 ? 'Today' : `${lastBackup} ${lastBackup === 1 ? 'day' : 'days'} ago`}
          </Text>
        </View>

        <Text style={styles.body}>
          Everything lives only on this phone, so a backup is the only copy. It holds your workouts,
          sport, streaks, tokens, excuses, places, trophies, experiments and full health history.
          Health Connect only keeps 30 days, so older health data exists only in your backups.
        </Text>

        <TouchableOpacity style={[styles.primary, busy && styles.disabled]} onPress={exportBackup} disabled={!!busy}>
          <Download size={18} color={colors.bg} strokeWidth={2.5} />
          <Text style={styles.primaryText}>{busy === 'export' ? 'SAVING…' : 'SAVE A BACKUP'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.secondary, busy && styles.disabled]} onPress={importBackup} disabled={!!busy}>
          <Upload size={18} color={colors.accent} strokeWidth={2.5} />
          <Text style={styles.secondaryText}>{busy === 'import' ? 'RESTORING…' : 'RESTORE FROM A BACKUP'}</Text>
        </TouchableOpacity>
        <Text style={styles.note}>Restoring replaces what’s on this phone with the backup.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 14 },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 4 },
  cardLabel: { fontFamily: fonts.heading, fontSize: 13, color: colors.textDim, letterSpacing: 1 },
  cardValue: { fontFamily: fonts.heading, fontSize: 24, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 6,
  },
  primaryText: { fontFamily: fonts.heading, fontSize: 15, color: colors.bg },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
  },
  secondaryText: { fontFamily: fonts.heading, fontSize: 15, color: colors.accent },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
