import { useCallback, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import {
  BatteryCharging,
  BookOpen,
  Database,
  FlaskConical,
  Info,
  MapPin,
  PlayCircle,
  Shield,
  User,
} from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsRows';
import { UserService } from '@/services/UserService';
import { PlaceService } from '@/services/PlaceService';
import { BackupReminderService } from '@/services/BackupReminderService';
import { BackgroundReliabilityService } from '@/services/BackgroundReliabilityService';
import { TestDataService } from '@/services/TestDataService';
import { TourStorage } from '@/components/tour/Tour';
import { ALL_TOURS } from '@/constants/tour';
import { colors, fonts } from '@/constants/theme';

const PRIVACY_URL =
  'https://doc-hosting.flycricket.io/nowomp-privacy-policy/4dc3e839-0361-4540-a557-7897c4d6c05d/privacy';

const ago = (days: number | null) =>
  days == null ? 'Never' : days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;

/** Settings: a short list of rows. Anything with more than one control has its own screen. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [placeCount, setPlaceCount] = useState(0);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [devTaps, setDevTaps] = useState(0);
  const [showDev, setShowDev] = useState(false);
  const [hasTestData, setHasTestData] = useState(false);
  const [testDataBusy, setTestDataBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      UserService.getCurrentUser().then((u) => {
        setName(u?.display_name ?? '');
        setMemberSince(u?.created_at ? new Date(u.created_at).toLocaleDateString() : null);
      });
      PlaceService.count().then(setPlaceCount).catch(() => {});
      BackupReminderService.daysSinceBackup().then(setLastBackup).catch(() => {});
    }, [])
  );

  const replayTour = async () => {
    // Clearing the flags makes each tour run again on its next visit.
    await TourStorage.resetAll(ALL_TOURS);
    // navigate (not replace) returns to the existing Today tab instead of
    // stacking a second copy of the tabs.
    router.navigate('/(tabs)');
  };

  // The five-tap panel holds test data (safe in release: it tracks and can
  // remove exactly what it adds) and, in debug builds only, the dev tools
  // link — those mutate streaks, dates and tokens directly.
  const devTap = () => {
    const next = devTaps + 1;
    setDevTaps(next);
    if (next >= 5) {
      setShowDev(true);
      setDevTaps(0);
      TestDataService.hasTestData().then(setHasTestData);
    }
  };

  const generateTestData = () => {
    Alert.alert(
      'Generate test data?',
      'Adds 60 days of fake workouts, sport, excuses, sleep, steps and heart data, plus a finished experiment, so you can try the Lab, Trophies and Health screens. Days with real workouts are left alone.\n\nRemove it any time from this panel.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setTestDataBusy(true);
            try {
              const r = await TestDataService.generate();
              setHasTestData(true);
              Alert.alert(
                'Test data added',
                `${r.workouts} sessions, ${r.skips} excuses, ${r.healthDays} days of health data and ${r.experiments} finished experiment. Check the Lab and You tabs.`
              );
            } catch (error) {
              Alert.alert('Error', (error as Error).message);
            } finally {
              setTestDataBusy(false);
            }
          },
        },
      ]
    );
  };

  const removeTestData = () => {
    Alert.alert(
      'Remove test data?',
      'Deletes only the generated rows. Trophies are re-checked against your real data, so any you still qualify for come back with today’s date.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setTestDataBusy(true);
            try {
              await TestDataService.remove();
              setHasTestData(false);
              Alert.alert('Test data removed', 'Back to your real data.');
            } catch (error) {
              Alert.alert('Error', (error as Error).message);
            } finally {
              setTestDataBusy(false);
            }
          },
        },
      ]
    );
  };

  const icon = (I: typeof User, color: string = colors.accent) => <I size={20} color={color} strokeWidth={2.2} />;

  return (
    <View style={styles.container}>
      <ScreenHeader title="SETTINGS" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup title="YOU">
          <SettingsRow first icon={icon(User)} label="Profile" value={name} onPress={() => router.push('/settings/profile')} />
          <SettingsRow
            icon={icon(MapPin)}
            label="Places"
            value={placeCount === 1 ? '1 place' : `${placeCount} places`}
            onPress={() => router.push('/settings/places')}
          />
        </SettingsGroup>

        <SettingsGroup title="DATA">
          <SettingsRow
            first
            icon={icon(Database)}
            label="Backup & restore"
            value={`Last: ${ago(lastBackup)}`}
            onPress={() => router.push('/settings/backup')}
          />
          {BackgroundReliabilityService.advice() && (
            <SettingsRow
              icon={icon(BatteryCharging, colors.warn)}
              label="Keep reminders working"
              onPress={() => router.push('/settings/phone')}
            />
          )}
        </SettingsGroup>

        <SettingsGroup title="HELP">
          <SettingsRow first icon={icon(BookOpen)} label="How NoWomp works" onPress={() => router.push('/rules')} />
          <SettingsRow icon={icon(PlayCircle)} label="Replay app tour" onPress={replayTour} />
          <SettingsRow
            icon={icon(Shield, colors.textDim)}
            label="Privacy policy"
            value="Opens browser"
            chevron={false}
            onPress={() => Linking.openURL(PRIVACY_URL)}
          />
        </SettingsGroup>

        <SettingsGroup title="ABOUT">
          <SettingsRow
            first
            icon={icon(Info, colors.textDim)}
            label="Version"
            value={Constants.expoConfig?.version ?? ''}
            onPress={devTap}
            chevron={false}
            activeOpacity={1}
          />
          {memberSince && <SettingsRow icon={icon(User, colors.textDim)} label="Member since" value={memberSince} />}
        </SettingsGroup>

        {/* DEV TOOLS — hidden, reveal by tapping Version 5 times */}
        {showDev && (
          <View style={styles.dev}>
            <View style={styles.devHeader}>
              <FlaskConical size={18} color={colors.danger} strokeWidth={2.5} />
              <Text style={styles.devTitle}>DEV TOOLS</Text>
            </View>
            <TouchableOpacity
              style={[styles.devButton, hasTestData && styles.devButtonDanger]}
              onPress={hasTestData ? removeTestData : generateTestData}
              disabled={testDataBusy}
            >
              <Text style={styles.devButtonText}>
                {testDataBusy ? 'WORKING...' : hasTestData ? 'REMOVE TEST DATA' : 'GENERATE TEST DATA'}
              </Text>
            </TouchableOpacity>
            {__DEV__ && (
              <TouchableOpacity
                style={styles.devButton}
                onPress={() => {
                  setShowDev(false);
                  router.push('/dev-tools');
                }}
              >
                <Text style={styles.devButtonText}>OPEN DEV TOOLS PANEL</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.devClose} onPress={() => setShowDev(false)}>
              <Text style={styles.devCloseText}>HIDE</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 24 },
  dev: {
    backgroundColor: '#1A0A0A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.danger,
    gap: 12,
  },
  devHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  devTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.danger },
  devButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.textFaint,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  devButtonDanger: { backgroundColor: '#3A0A0A', borderColor: colors.danger },
  devButtonText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text },
  devClose: { paddingVertical: 6, alignItems: 'center' },
  devCloseText: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
});
