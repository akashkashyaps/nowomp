import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Scale, Check } from 'lucide-react-native';
import { colors, fonts } from '@/constants/theme';
import { HealthScoreService } from '@/services/HealthScoreService';
import { HealthConnectService } from '@/services/HealthConnectService';

interface LogWeightCardProps {
  latest: { kg: number; date: string } | null;
  onLogged: () => void;
}

/**
 * Manual weight entry, for users whose scale doesn't write to Health Connect.
 * Entries land in the same store as synced data, so trends and the tile treat
 * them identically.
 */
export function LogWeightCard({ latest, onLogged }: LogWeightCardProps) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [shareToHC, setShareToHC] = useState(false);

  useEffect(() => {
    HealthConnectService.isWeightSharingEnabled().then(setShareToHC).catch(() => {});
  }, []);

  const toggleSharing = async () => {
    if (shareToHC) {
      await HealthConnectService.disableWeightSharing();
      setShareToHC(false);
      return;
    }

    const granted = await HealthConnectService.enableWeightSharing();
    setShareToHC(granted);
    if (!granted) {
      Alert.alert(
        'Permission needed',
        'Health Connect did not grant write access, so weight will stay in NoWomp only. You can allow it in Health Connect settings.'
      );
    }
  };

  const handleLog = async () => {
    const kg = parseFloat(value.trim());
    if (isNaN(kg) || kg < 20 || kg > 400) {
      Alert.alert('Invalid weight', 'Enter a weight between 20 and 400 kg.');
      return;
    }

    setSaving(true);
    try {
      await HealthScoreService.logWeight(kg);
      // Fire and forget: the weight is already saved locally, so a Health
      // Connect failure must not read as a failed log.
      HealthConnectService.writeWeight(kg).catch(() => {});
      setValue('');
      onLogged();
      // Carry-forward touches every stored day, so let it run after the UI has
      // already updated rather than making the tap wait for it.
      HealthScoreService.refreshAfterWeightLog().catch(() => {});
    } catch {
      Alert.alert('Error', 'Could not save your weight.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Scale size={18} color={colors.accent} strokeWidth={2.5} />
        <Text style={styles.headerTitle}>LOG WEIGHT</Text>
      </View>

      <Text style={styles.help}>
        {latest
          ? `Last logged ${latest.kg.toFixed(1)} kg on ${new Date(
              latest.date
            ).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.`
          : 'No weight recorded yet. Log one to start the trend.'}
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          placeholder="kg"
          placeholderTextColor={colors.textFaint}
          keyboardType="decimal-pad"
          maxLength={5}
        />
        <TouchableOpacity
          style={[styles.button, (saving || value.trim() === '') && styles.buttonDisabled]}
          onPress={handleLog}
          disabled={saving || value.trim() === ''}
        >
          <Text style={styles.buttonText}>{saving ? 'SAVING' : 'LOG'}</Text>
        </TouchableOpacity>
      </View>

      {/* Off by default. Everything else NoWomp does is read-only, so writing
          back is the user's call, not an assumption. */}
      <TouchableOpacity style={styles.shareRow} onPress={toggleSharing} activeOpacity={0.7}>
        <View style={[styles.checkbox, shareToHC && styles.checkboxOn]}>
          {shareToHC && <Check size={12} color={colors.bg} strokeWidth={3} />}
        </View>
        <Text style={styles.shareText}>
          Also save to Health Connect
          {shareToHC ? '' : ' — off, weight stays in NoWomp only'}
        </Text>
      </TouchableOpacity>

      {shareToHC && (
        <Text style={styles.shareNote}>
          New entries are shared with Health Connect so other apps can read them.
          Turning this off stops future entries; ones already shared stay there.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.text,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 16,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: fonts.numeric,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  shareText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
  },
  shareNote: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
    lineHeight: 15,
    marginTop: 8,
  },
  buttonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
    letterSpacing: 0.5,
  },
});
