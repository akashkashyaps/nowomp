import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { GymService } from '@/services/GymService';
import { LocationService } from '@/services/LocationService';
import { MapPin, Navigation, X, Home, Dumbbell } from 'lucide-react-native';

import { colors, fonts } from '@/constants/theme';
type LocationType = 'gym' | 'home';

export default function WorkoutLocationsScreen() {
  const insets = useSafeAreaInsets();
  const [gymCoordinates, setGymCoordinates] = useState('');
  const [homeCoordinates, setHomeCoordinates] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [currentLocationType, setCurrentLocationType] = useState<LocationType | null>(null);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLocationType, setWebViewLocationType] = useState<LocationType>('gym');
  const [gymSet, setGymSet] = useState(false);
  const [homeSet, setHomeSet] = useState(false);
  const webViewRef = useRef<WebView>(null);

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

  const handleUseCurrentLocation = async (locationType: LocationType) => {
    setFetchingLocation(true);
    setCurrentLocationType(locationType);
    try {
      const location = await LocationService.getCurrentLocation();
      const { latitude, longitude } = location.coords;

      await GymService.createGym({
        location_type: locationType,
        latitude,
        longitude,
        radius: 200,
      });

      if (locationType === 'gym') {
        setGymSet(true);
      } else {
        setHomeSet(true);
      }

      Alert.alert('Success', `${locationType === 'gym' ? 'Gym' : 'Home'} location set!`);
    } catch (error: any) {
      console.error('Error getting current location:', error);
      const errorMessage = LocationService.getErrorMessage(error);
      Alert.alert('Location Error', errorMessage);
    } finally {
      setFetchingLocation(false);
      setCurrentLocationType(null);
    }
  };

  const handleSaveLocation = async (locationType: LocationType) => {
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

    setLoading(true);
    try {
      await GymService.createGym({
        location_type: locationType,
        latitude: parsedCoordinates.latitude,
        longitude: parsedCoordinates.longitude,
        radius: 200,
      });

      if (locationType === 'gym') {
        setGymSet(true);
        setGymCoordinates('');
      } else {
        setHomeSet(true);
        setHomeCoordinates('');
      }

      Alert.alert('Success', `${locationType === 'gym' ? 'Gym' : 'Home'} location saved!`);
    } catch (error) {
      console.error('Error saving location:', error);
      Alert.alert('Error', 'Failed to save location');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (!gymSet && !homeSet) {
      Alert.alert('Setup Required', 'Please set at least one workout location to continue.');
      return;
    }
    router.replace('/(tabs)');
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

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>SET WORKOUT LOCATIONS</Text>
          <Text style={styles.subtitle}>Set your gym and/or home location</Text>
          <Text style={styles.note}>At least one location required</Text>
        </View>

        {/* GYM LOCATION SECTION */}
        <View style={styles.locationSection}>
          <View style={styles.locationHeader}>
            <Dumbbell size={22} color={colors.accent} />
            <Text style={styles.locationHeaderText}>GYM LOCATION</Text>
            {gymSet && <Text style={styles.setIndicator}>SET</Text>}
          </View>

          {/* Option 1: Use Current Location */}
          <View style={styles.optionContainer}>
            <View style={styles.optionHeader}>
              <Navigation size={16} color={colors.accent} />
              <Text style={styles.optionTitle}>I’M AT THE GYM NOW</Text>
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, (fetchingLocation && currentLocationType === 'gym') && styles.buttonDisabled]}
              onPress={() => handleUseCurrentLocation('gym')}
              disabled={fetchingLocation || loading}
            >
              {(fetchingLocation && currentLocationType === 'gym') ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.primaryButtonText}>USE CURRENT LOCATION</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.smallDivider}>
            <View style={styles.smallDividerLine} />
            <Text style={styles.smallDividerText}>OR</Text>
            <View style={styles.smallDividerLine} />
          </View>

          {/* Option 2: Enter Manually */}
          <View style={styles.optionContainer}>
            <View style={styles.optionHeader}>
              <MapPin size={16} color={colors.textDim} />
              <Text style={styles.optionTitle}>ENTER MANUALLY</Text>
            </View>

            <TouchableOpacity
              style={[styles.secondaryButton, (loading || fetchingLocation) && styles.buttonDisabled]}
              onPress={() => handleOpenPlusCodes('gym')}
              disabled={loading || fetchingLocation}
            >
              <Text style={styles.secondaryButtonText}>GET GYM COORDINATES</Text>
            </TouchableOpacity>

            <Text style={styles.orText}>OR</Text>

            <TextInput
              style={styles.input}
              value={gymCoordinates}
              onChangeText={setGymCoordinates}
              placeholder="40.7128, -74.0060"
              placeholderTextColor={colors.textFaint}
              editable={!loading && !fetchingLocation}
            />

            <TouchableOpacity
              style={[styles.secondaryButton, (!gymCoordinates.trim() || loading || fetchingLocation) && styles.buttonDisabled]}
              onPress={() => handleSaveLocation('gym')}
              disabled={!gymCoordinates.trim() || loading || fetchingLocation}
            >
              <Text style={styles.secondaryButtonText}>
                {loading ? 'SAVING...' : 'SAVE GYM LOCATION'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
        </View>

        {/* HOME LOCATION SECTION */}
        <View style={styles.locationSection}>
          <View style={styles.locationHeader}>
            <Home size={22} color={colors.accent} />
            <Text style={styles.locationHeaderText}>HOME LOCATION</Text>
            {homeSet && <Text style={styles.setIndicator}>SET</Text>}
          </View>

          {/* Option 1: Use Current Location */}
          <View style={styles.optionContainer}>
            <View style={styles.optionHeader}>
              <Navigation size={16} color={colors.accent} />
              <Text style={styles.optionTitle}>I’M AT HOME NOW</Text>
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, (fetchingLocation && currentLocationType === 'home') && styles.buttonDisabled]}
              onPress={() => handleUseCurrentLocation('home')}
              disabled={fetchingLocation || loading}
            >
              {(fetchingLocation && currentLocationType === 'home') ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.primaryButtonText}>USE CURRENT LOCATION</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.smallDivider}>
            <View style={styles.smallDividerLine} />
            <Text style={styles.smallDividerText}>OR</Text>
            <View style={styles.smallDividerLine} />
          </View>

          {/* Option 2: Enter Manually */}
          <View style={styles.optionContainer}>
            <View style={styles.optionHeader}>
              <MapPin size={16} color={colors.textDim} />
              <Text style={styles.optionTitle}>ENTER MANUALLY</Text>
            </View>

            <TouchableOpacity
              style={[styles.secondaryButton, (loading || fetchingLocation) && styles.buttonDisabled]}
              onPress={() => handleOpenPlusCodes('home')}
              disabled={loading || fetchingLocation}
            >
              <Text style={styles.secondaryButtonText}>GET HOME COORDINATES</Text>
            </TouchableOpacity>

            <Text style={styles.orText}>OR</Text>

            <TextInput
              style={styles.input}
              value={homeCoordinates}
              onChangeText={setHomeCoordinates}
              placeholder="40.7128, -74.0060"
              placeholderTextColor={colors.textFaint}
              editable={!loading && !fetchingLocation}
            />

            <TouchableOpacity
              style={[styles.secondaryButton, (!homeCoordinates.trim() || loading || fetchingLocation) && styles.buttonDisabled]}
              onPress={() => handleSaveLocation('home')}
              disabled={!homeCoordinates.trim() || loading || fetchingLocation}
            >
              <Text style={styles.secondaryButtonText}>
                {loading ? 'SAVING...' : 'SAVE HOME LOCATION'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Continue Button */}
        <TouchableOpacity
          style={[styles.continueButton, (!gymSet && !homeSet) && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!gymSet && !homeSet}
        >
          <Text style={styles.continueButtonText}>CONTINUE TO APP</Text>
        </TouchableOpacity>
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
                            setLoading(true);
                            try {
                              await GymService.createGym({
                                location_type: webViewLocationType,
                                latitude,
                                longitude,
                                radius: 200
                              });

                              if (webViewLocationType === 'gym') {
                                setGymSet(true);
                                setGymCoordinates('');
                              } else {
                                setHomeSet(true);
                                setHomeCoordinates('');
                              }
                            } catch {
                              Alert.alert('Error', 'Failed to save location');
                            } finally {
                              setLoading(false);
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
    paddingHorizontal: 32,
    marginBottom: 28,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 32,
    flexGrow: 1,
  },
  locationSection: {
    marginBottom: 16,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  locationHeaderText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  setIndicator: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.accent,
    backgroundColor: '#1A3310',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  optionContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  optionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
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
  },
  secondaryButtonText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    color: colors.accent,
  },
  divider: {
    marginVertical: 16,
  },
  dividerLine: {
    height: 1,
    backgroundColor: colors.border,
  },
  smallDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 8,
  },
  smallDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  smallDividerText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textFaint,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.text,
    marginBottom: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  orText: {
    fontFamily: fonts.bodySemi,
    fontSize: 10,
    color: colors.textFaint,
    textAlign: 'center',
    marginVertical: 10,
  },
  continueButton: {
    backgroundColor: colors.accent,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 20,
  },
  continueButtonText: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.bg,
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
});
