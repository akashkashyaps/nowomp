import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Modal, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { UserService } from '@/services/UserService';
import { GymService } from '@/services/GymService';
import { LocationService } from '@/services/LocationService';
import { ExportService } from '@/services/ExportService';
import { HealthProfileService } from '@/services/HealthProfileService';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TestDataService } from '@/services/TestDataService';
import { BackupReminderService } from '@/services/BackupReminderService';
import { BackgroundReliabilityService } from '@/services/BackgroundReliabilityService';
import { BackgroundReliabilityCard } from '@/components/BackgroundReliabilityCard';
import { TourStorage } from '@/components/tour/Tour';
import { ALL_TOURS } from '@/constants/tour';
import { Download, Upload, User, MapPin, Database, HelpCircle, Navigation, Home, Dumbbell, X, FlaskConical, Shield, Activity } from 'lucide-react-native';

import { colors, fonts } from '@/constants/theme';
type LocationType = 'gym' | 'home';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<any>(null);
  const [gym, setGym] = useState<any>(null);
  const [home, setHome] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [ageLoading, setAgeLoading] = useState(false);
  const [gymCoordinates, setGymCoordinates] = useState('');
  const [homeCoordinates, setHomeCoordinates] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState<LocationType | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState<LocationType | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [devTapCount, setDevTapCount] = useState(0);
  const [showDevTools, setShowDevTools] = useState(false);
  const [hasTestData, setHasTestData] = useState(false);
  const [testDataLoading, setTestDataLoading] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLocationType, setWebViewLocationType] = useState<LocationType>('gym');
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    loadUserData();
    loadGymData();
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await UserService.getCurrentUser();
      if (userData) {
        setUser(userData);
        setDisplayName(userData.display_name);
        setAge(userData.age != null ? String(userData.age) : '');
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadGymData = async () => {
    try {
      const { gym: gymData, home: homeData } = await GymService.getUserLocations();
      setGym(gymData);
      setHome(homeData);
    } catch (error) {
      console.error('Error loading location data:', error);
    }
  };

  const handleUpdateName = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Display name cannot be empty');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'No user found');
      return;
    }

    setLoading(true);
    try {
      await UserService.updateUser(user.id, displayName.trim());
      setUser({ ...user, display_name: displayName.trim() });
      Alert.alert('Success', 'Display name updated!');
    } catch (error) {
      console.error('Error updating name:', error);
      Alert.alert('Error', 'Failed to update display name');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAge = async () => {
    if (!user) {
      Alert.alert('Error', 'No user found');
      return;
    }

    const trimmed = age.trim();
    // Blank clears the value and falls the app back to an estimated max HR.
    const parsed = trimmed === '' ? null : parseInt(trimmed, 10);

    if (parsed !== null && (isNaN(parsed) || parsed < 13 || parsed > 100)) {
      Alert.alert('Invalid Age', 'Enter an age between 13 and 100, or leave it blank.');
      return;
    }

    setAgeLoading(true);
    try {
      await HealthProfileService.updateProfile({ age: parsed });
      setUser({ ...user, age: parsed });
      Alert.alert('Success', 'Age updated!');
    } catch (error) {
      console.error('Error updating age:', error);
      Alert.alert('Error', 'Failed to update age');
    } finally {
      setAgeLoading(false);
    }
  };

  const parseCoordinates = (coords: string): { latitude: number; longitude: number } | null => {
    try {
      const coordMatch = coords.trim().match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleUpdateLocation = async (locationType: LocationType) => {
    const coordinates = locationType === 'gym' ? gymCoordinates : homeCoordinates;

    if (!coordinates.trim()) {
      Alert.alert('Error', 'Please enter coordinates');
      return;
    }

    const parsedCoordinates = parseCoordinates(coordinates.trim());
    if (!parsedCoordinates) {
      Alert.alert('Invalid Coordinates', 'Format: 40.7128, -74.0060');
      return;
    }

    setLocationLoading(locationType);
    try {
      await GymService.createGym({
        location_type: locationType,
        latitude: parsedCoordinates.latitude,
        longitude: parsedCoordinates.longitude,
        radius: 200,
      });
      await loadGymData();

      if (locationType === 'gym') {
        setGymCoordinates('');
      } else {
        setHomeCoordinates('');
      }

      Alert.alert('Success', `${locationType === 'gym' ? 'Gym' : 'Home'} location updated!`);
    } catch (error) {
      console.error('Error updating location:', error);
      Alert.alert('Error', 'Failed to update location');
    } finally {
      setLocationLoading(null);
    }
  };

  const handleUseCurrentLocation = async (locationType: LocationType) => {
    setFetchingLocation(locationType);
    try {
      const location = await LocationService.getCurrentLocation();
      const { latitude, longitude } = location.coords;

      await GymService.createGym({
        location_type: locationType,
        latitude,
        longitude,
        radius: 200,
      });

      await loadGymData();
      Alert.alert('Success', `${locationType === 'gym' ? 'Gym' : 'Home'} location updated!`);
    } catch (error: any) {
      console.error('Error getting current location:', error);
      const errorMessage = LocationService.getErrorMessage(error);
      Alert.alert('Location Error', errorMessage);
    } finally {
      setFetchingLocation(null);
    }
  };

  const handleOpenPlusCodes = (locationType: LocationType) => {
    setWebViewLocationType(locationType);
    setShowWebView(true);
  };

  const handleWebViewNavigationChange = (navState: any) => {
    const { url } = navState;
    const plusCodePattern = /plus\.codes\/([A-Z0-9]{4,}\+[A-Z0-9]{2,})/;
    const hasPlusCode = plusCodePattern.test(url);

    if (hasPlusCode) {
      webViewRef.current?.injectJavaScript(`
        window.searchOccurred = true;
        true;
      `);
    }
  };

  const handleExportComplete = async () => {
    setExportLoading(true);
    try {
      await ExportService.exportAllData();
      await BackupReminderService.markBackedUp();
      Alert.alert('Success', 'Backup exported!');
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', 'Failed to export backup');
    } finally {
      setExportLoading(false);
    }
  };

  const handleDevTap = () => {
    // The five-tap panel holds test data (safe in release: it tracks and can
    // remove exactly what it adds) and, in debug builds only, the dev tools
    // link — those mutate streaks, dates and tokens directly.
    const next = devTapCount + 1;
    setDevTapCount(next);
    if (next >= 5) {
      setShowDevTools(true);
      setDevTapCount(0);
      TestDataService.hasTestData().then(setHasTestData);
    }
  };

  const handleGenerateTestData = () => {
    Alert.alert(
      'Generate test data?',
      'Adds 60 days of fake workouts, excuses, sleep, steps and heart data, plus a finished experiment, so you can try the Lab, Trophies and Health screens. Days with real workouts are left alone.\n\nRemove it any time from this panel.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setTestDataLoading(true);
            try {
              const r = await TestDataService.generate();
              setHasTestData(true);
              Alert.alert(
                'Test data added',
                `${r.workouts} workouts, ${r.skips} excuses, ${r.healthDays} days of health data and ${r.experiments} finished experiment. Check the Lab and You tabs.`
              );
            } catch (error) {
              Alert.alert('Error', (error as Error).message);
            } finally {
              setTestDataLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRemoveTestData = () => {
    Alert.alert(
      'Remove test data?',
      'Deletes only the generated rows. Trophies are re-checked against your real data, so any you still qualify for come back with today’s date.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setTestDataLoading(true);
            try {
              await TestDataService.remove();
              setHasTestData(false);
              Alert.alert('Test data removed', 'Back to your real data.');
            } catch (error) {
              Alert.alert('Error', (error as Error).message);
            } finally {
              setTestDataLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleImportData = async () => {
    try {
      setImportLoading(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        await ExportService.importData(file.uri);
        await loadUserData();
        await loadGymData();
      }
    } catch (error) {
      console.error('Import error:', error);
      Alert.alert('Error', 'Failed to import data');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="SETTINGS" />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Display Name Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <User size={18} color={colors.accent} strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>DISPLAY NAME</Text>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter display name"
              placeholderTextColor={colors.textFaint}
              maxLength={30}
            />
          </View>

          <TouchableOpacity
            style={[styles.updateButton, (loading || !displayName.trim() || displayName === user?.display_name) && styles.buttonDisabled]}
            onPress={handleUpdateName}
            disabled={loading || !displayName.trim() || displayName === user?.display_name}
          >
            <Text style={styles.updateButtonText}>
              {loading ? 'UPDATING...' : 'UPDATE NAME'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Age Section — feeds max heart rate estimation for HR zones */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Activity size={18} color={colors.accent} strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>AGE</Text>
          </View>

          <Text style={styles.sectionDescription}>
            Optional. Sets your max heart rate (Tanaka formula) and sleep target on
            the Health tab. More options — sex, sleep goal, measured max HR — are on
            the Health tab itself.
          </Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={age}
              onChangeText={setAge}
              placeholder="Enter age"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>

          <TouchableOpacity
            style={[styles.updateButton, (ageLoading || age === (user?.age != null ? String(user.age) : '')) && styles.buttonDisabled]}
            onPress={handleUpdateAge}
            disabled={ageLoading || age === (user?.age != null ? String(user.age) : '')}
          >
            <Text style={styles.updateButtonText}>
              {ageLoading ? 'UPDATING...' : 'UPDATE AGE'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Workout Locations Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MapPin size={18} color={colors.accent} strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>WORKOUT LOCATIONS</Text>
          </View>

          {/* GYM LOCATION */}
          <View style={styles.locationTypeSection}>
            <View style={styles.locationTypeHeader}>
              <Dumbbell size={16} color={colors.accent} />
              <Text style={styles.locationTypeTitle}>GYM LOCATION</Text>
            </View>

            {gym && (
              <View style={styles.currentLocationContainer}>
                <Text style={styles.currentLocationLabel}>Current:</Text>
                <Text style={styles.currentLocationText}>
                  {gym.latitude.toFixed(6)}, {gym.longitude.toFixed(6)}
                </Text>
                <Text style={styles.radiusText}>Radius: {gym.radius}m</Text>
              </View>
            )}

            {/* Option 1: Use Current Location */}
            <View style={styles.locationOptionContainer}>
              <View style={styles.locationOptionHeader}>
                <Navigation size={14} color={colors.accent} />
                <Text style={styles.locationOptionTitle}>I’M AT THE GYM NOW</Text>
              </View>
              <TouchableOpacity
                style={[styles.currentLocationButton, (fetchingLocation === 'gym') && styles.buttonDisabled]}
                onPress={() => handleUseCurrentLocation('gym')}
                disabled={!!fetchingLocation || !!locationLoading}
              >
                {(fetchingLocation === 'gym') ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.currentLocationButtonText}>USE CURRENT LOCATION</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Option 2: Enter Manually */}
            <View style={styles.locationOptionContainer}>
              <View style={styles.locationOptionHeader}>
                <MapPin size={14} color={colors.textDim} />
                <Text style={styles.locationOptionTitle}>ENTER MANUALLY</Text>
              </View>

              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={gymCoordinates}
                  onChangeText={setGymCoordinates}
                  placeholder="52.958798, -1.155622"
                  placeholderTextColor={colors.textFaint}
                  editable={!locationLoading && !fetchingLocation}
                />
              </View>

              <TouchableOpacity
                style={[styles.secondaryButton, (loading || fetchingLocation) && styles.buttonDisabled]}
                onPress={() => handleOpenPlusCodes('gym')}
                disabled={!!loading || !!fetchingLocation}
              >
                <Text style={styles.secondaryButtonText}>FIND GYM COORDINATES</Text>
              </TouchableOpacity>

              <Text style={styles.orText}>OR</Text>

              <TouchableOpacity
                style={[styles.updateLocationButton, ((locationLoading === 'gym') || !!fetchingLocation || !gymCoordinates.trim()) && styles.buttonDisabled]}
                onPress={() => handleUpdateLocation('gym')}
                disabled={(locationLoading === 'gym') || !!fetchingLocation || !gymCoordinates.trim()}
              >
                <Text style={styles.updateLocationButtonText}>
                  {(locationLoading === 'gym') ? 'UPDATING...' : 'UPDATE GYM'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* HOME LOCATION */}
          <View style={[styles.locationTypeSection, styles.homeLocationSection]}>
            <View style={styles.locationTypeHeader}>
              <Home size={16} color={colors.accent} />
              <Text style={styles.locationTypeTitle}>HOME LOCATION</Text>
            </View>

            {home && (
              <View style={styles.currentLocationContainer}>
                <Text style={styles.currentLocationLabel}>Current:</Text>
                <Text style={styles.currentLocationText}>
                  {home.latitude.toFixed(6)}, {home.longitude.toFixed(6)}
                </Text>
                <Text style={styles.radiusText}>Radius: {home.radius}m</Text>
              </View>
            )}

            {/* Option 1: Use Current Location */}
            <View style={styles.locationOptionContainer}>
              <View style={styles.locationOptionHeader}>
                <Navigation size={14} color={colors.accent} />
                <Text style={styles.locationOptionTitle}>I’M AT HOME NOW</Text>
              </View>
              <TouchableOpacity
                style={[styles.currentLocationButton, (fetchingLocation === 'home') && styles.buttonDisabled]}
                onPress={() => handleUseCurrentLocation('home')}
                disabled={!!fetchingLocation || !!locationLoading}
              >
                {(fetchingLocation === 'home') ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.currentLocationButtonText}>USE CURRENT LOCATION</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Option 2: Enter Manually */}
            <View style={styles.locationOptionContainer}>
              <View style={styles.locationOptionHeader}>
                <MapPin size={14} color={colors.textDim} />
                <Text style={styles.locationOptionTitle}>ENTER MANUALLY</Text>
              </View>

              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={homeCoordinates}
                  onChangeText={setHomeCoordinates}
                  placeholder="52.958798, -1.155622"
                  placeholderTextColor={colors.textFaint}
                  editable={!locationLoading && !fetchingLocation}
                />
              </View>

              <TouchableOpacity
                style={[styles.secondaryButton, (loading || fetchingLocation) && styles.buttonDisabled]}
                onPress={() => handleOpenPlusCodes('home')}
                disabled={!!loading || !!fetchingLocation}
              >
                <Text style={styles.secondaryButtonText}>FIND HOME COORDINATES</Text>
              </TouchableOpacity>

              <Text style={styles.orText}>OR</Text>

              <TouchableOpacity
                style={[styles.updateLocationButton, ((locationLoading === 'home') || !!fetchingLocation || !homeCoordinates.trim()) && styles.buttonDisabled]}
                onPress={() => handleUpdateLocation('home')}
                disabled={(locationLoading === 'home') || !!fetchingLocation || !homeCoordinates.trim()}
              >
                <Text style={styles.updateLocationButtonText}>
                  {(locationLoading === 'home') ? 'UPDATING...' : 'UPDATE HOME'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Data Management Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Database size={18} color={colors.accent} strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>DATA MANAGEMENT</Text>
          </View>

          <Text style={styles.sectionDescription}>
            A full backup carries everything: workouts, streaks, freeze tokens,
            excuses, and your entire health history including sleep, journal and
            journeys. Health Connect only keeps 30 days, so anything older lives
            only in this backup — keep one before switching phones.
          </Text>

          <TouchableOpacity
            style={[styles.backupButton, exportLoading && styles.buttonDisabled]}
            onPress={handleExportComplete}
            disabled={exportLoading}
          >
            <Download size={18} color={colors.bg} strokeWidth={2.5} />
            <Text style={styles.backupButtonText}>
              {exportLoading ? 'CREATING BACKUP...' : 'FULL BACKUP'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.importButton, importLoading && styles.buttonDisabled]}
            onPress={handleImportData}
            disabled={importLoading}
          >
            <Upload size={18} color={colors.accent} strokeWidth={2.5} />
            <Text style={styles.importButtonText}>
              {importLoading ? 'IMPORTING...' : 'IMPORT BACKUP'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Background reliability: only on makers that kill background apps */}
        {BackgroundReliabilityService.advice() && (
          <View style={styles.section}>
            <BackgroundReliabilityCard />
          </View>
        )}

        {/* Help Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <HelpCircle size={18} color={colors.accent} strokeWidth={2.5} />
            <Text style={styles.sectionTitle}>HELP</Text>
          </View>

          <Text style={styles.sectionDescription}>
            Need a refresher? Replay the quick tour, or read the full rules.
          </Text>

          <TouchableOpacity
            style={styles.tutorialButton}
            onPress={async () => {
              // Clearing the flags makes each tour run again on its next visit.
              await TourStorage.resetAll(ALL_TOURS);
              // navigate (not replace) returns to the existing Today tab
              // instead of stacking a second copy of the tabs.
              router.navigate('/(tabs)');
            }}
          >
            <Text style={styles.tutorialButtonText}>REPLAY APP TOUR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tutorialButton, { marginTop: 10 }]}
            onPress={() => router.push('/rules')}
          >
            <Text style={styles.tutorialButtonText}>HOW NOWOMP WORKS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.privacyButton}
            onPress={() => Linking.openURL('https://doc-hosting.flycricket.io/nowomp-privacy-policy/4dc3e839-0361-4540-a557-7897c4d6c05d/privacy')}
          >
            <Shield size={16} color={colors.textDim} strokeWidth={2} />
            <Text style={styles.privacyButtonText}>PRIVACY POLICY</Text>
          </TouchableOpacity>
        </View>

        {/* User Info */}
        {user && (
          <View style={styles.infoSection}>
            <TouchableOpacity onPress={handleDevTap} activeOpacity={1}>
              <Text style={styles.infoTitle}>ACCOUNT INFO</Text>
            </TouchableOpacity>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Member since:</Text>
              <Text style={styles.infoValue}>
                {new Date(user.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
        )}

        {/* DEV TOOLS — hidden, reveal by tapping ACCOUNT INFO 5 times */}
        {showDevTools && (
          <View style={styles.devSection}>
            <View style={styles.sectionHeader}>
              <FlaskConical size={18} color={colors.danger} strokeWidth={2.5} />
              <Text style={styles.devTitle}>DEV TOOLS</Text>
            </View>
            {hasTestData ? (
              <TouchableOpacity
                style={[styles.devButton, styles.devButtonDanger]}
                onPress={handleRemoveTestData}
                disabled={testDataLoading}
              >
                <Text style={styles.devButtonText}>
                  {testDataLoading ? 'WORKING...' : 'REMOVE TEST DATA'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.devButton}
                onPress={handleGenerateTestData}
                disabled={testDataLoading}
              >
                <Text style={styles.devButtonText}>
                  {testDataLoading ? 'WORKING...' : 'GENERATE TEST DATA'}
                </Text>
              </TouchableOpacity>
            )}
            {__DEV__ && (
              <TouchableOpacity
                style={styles.devButton}
                onPress={() => { setShowDevTools(false); router.push('/dev-tools'); }}
              >
                <Text style={styles.devButtonText}>OPEN DEV TOOLS PANEL</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.devButtonClose}
              onPress={() => setShowDevTools(false)}
            >
              <Text style={styles.devButtonCloseText}>HIDE</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* WebView Modal */}
      <Modal
        visible={showWebView}
        animationType="slide"
        onRequestClose={() => setShowWebView(false)}
      >
        <View style={styles.webViewContainer}>
          <View style={styles.webViewHeader}>
            <Text style={styles.webViewTitle}>
              Search for your {webViewLocationType === 'gym' ? 'gym' : 'home'}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowWebView(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <WebView
            ref={webViewRef}
            source={{ uri: 'https://plus.codes/map' }}
            onNavigationStateChange={handleWebViewNavigationChange}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={(event) => {
              const data = event.nativeEvent.data;
              try {
                const coords = JSON.parse(data);
                if (coords.latitude && coords.longitude) {
                  const latitude = parseFloat(coords.latitude);
                  const longitude = parseFloat(coords.longitude);

                  if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
                    const coordString = `${latitude}, ${longitude}`;

                    if (webViewLocationType === 'gym') {
                      setGymCoordinates(coordString);
                    } else {
                      setHomeCoordinates(coordString);
                    }
                    setShowWebView(false);

                    Alert.alert(
                      'Location Found',
                      `Save as ${webViewLocationType} location?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Save',
                          onPress: async () => {
                            setLocationLoading(webViewLocationType);
                            try {
                              await GymService.createGym({
                                location_type: webViewLocationType,
                                latitude,
                                longitude,
                                radius: 200
                              });

                              await loadGymData();

                              if (webViewLocationType === 'gym') {
                                setGymCoordinates('');
                              } else {
                                setHomeCoordinates('');
                              }
                            } catch {
                              Alert.alert('Error', 'Failed to save location');
                            } finally {
                              setLocationLoading(null);
                            }
                          },
                        },
                      ]
                    );
                  }
                }
              } catch (err) {
                console.log('Failed to parse coordinates:', err);
              }
            }}
            injectedJavaScript={`
              (function() {
                let lastCoordinates = null;
                let initialCoordinates = null;
                window.searchOccurred = false;

                function extractCoordinates() {
                  try {
                    const bodyText = document.body.innerText;
                    const coordMatch = bodyText.match(/(-?\\d+\\.\\d{4,})\\s*,\\s*(-?\\d+\\.\\d{4,})/);

                    if (coordMatch) {
                      const newCoordinates = coordMatch[1] + ',' + coordMatch[2];

                      if (!initialCoordinates) {
                        initialCoordinates = newCoordinates;
                        lastCoordinates = newCoordinates;
                        return;
                      }

                      if (window.searchOccurred &&
                          newCoordinates !== lastCoordinates &&
                          newCoordinates !== initialCoordinates) {
                        lastCoordinates = newCoordinates;
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                          latitude: coordMatch[1],
                          longitude: coordMatch[2]
                        }));
                      }
                    }
                  } catch (error) {
                    console.log('Error extracting coordinates:', error);
                  }
                }

                setInterval(extractCoordinates, 2000);
                document.addEventListener('click', function() {
                  setTimeout(extractCoordinates, 1000);
                });
                setTimeout(extractCoordinates, 2000);
              })();
              true;
            `}
            style={styles.webView}
          />
        </View>
      </Modal>
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
    paddingBottom: 32,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.accent,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  section: {
    marginBottom: 36,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.accent,
  },
  sectionDescription: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 20,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    color: colors.text,
  },
  updateButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
  },
  updateButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
    textAlign: 'center',
  },
  backupButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  backupButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
  },
  importButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  importButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.accent,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  currentLocationContainer: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currentLocationLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  currentLocationText: {
    fontFamily: fonts.numeric,
    fontSize: 13,
    color: colors.accent,
    marginBottom: 4,
  },
  radiusText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
  },
  locationButtonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  helpButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.textFaint,
    paddingVertical: 12,
    borderRadius: 8,
  },
  helpButtonText: {
    fontFamily: fonts.heading,
    fontSize: 11,
    color: colors.textFaint,
    textAlign: 'center',
  },
  updateLocationButton: {
    flex: 2,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 8,
  },
  updateLocationButtonText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    color: colors.bg,
    textAlign: 'center',
  },
  infoSection: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 40,
    borderWidth: 2,
    borderColor: colors.border,
  },
  infoTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.text,
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  infoValue: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: colors.text,
  },
  tutorialButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  tutorialButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
    textAlign: 'center',
  },
  privacyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  privacyButtonText: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    color: colors.textDim,
  },
  locationTypeSection: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  homeLocationSection: {
    borderColor: colors.border,
  },
  locationTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  locationTypeTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.text,
    letterSpacing: 0.5,
  },
  locationOptionContainer: {
    marginBottom: 12,
  },
  locationOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  locationOptionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.text,
    letterSpacing: 0.5,
  },
  currentLocationButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  currentLocationButtonText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    color: colors.bg,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginBottom: 10,
  },
  secondaryButtonText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    color: colors.accent,
  },
  orText: {
    fontFamily: fonts.bodySemi,
    fontSize: 10,
    color: colors.textFaint,
    textAlign: 'center',
    marginVertical: 10,
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  webViewTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  closeButton: {
    padding: 8,
  },
  webView: {
    flex: 1,
  },
  devSection: {
    backgroundColor: '#1A0A0A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 40,
    borderWidth: 2,
    borderColor: colors.danger,
    gap: 12,
  },
  devTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.danger,
  },
  devButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.textFaint,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  devButtonDanger: {
    backgroundColor: '#3A0A0A',
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  devButtonText: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    color: colors.text,
  },
  devButtonClose: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  devButtonCloseText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
  },
});
