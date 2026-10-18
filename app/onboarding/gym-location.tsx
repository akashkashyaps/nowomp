import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { GymService } from '@/services/GymService';
import { LocationService } from '@/services/LocationService';
import { MapPin, Navigation, X } from 'lucide-react-native';

import { colors, fonts } from '@/constants/theme';
export default function GymLocationScreen() {
  const insets = useSafeAreaInsets();
  const [coordinates, setCoordinates] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const parseCoordinates = (coords: string): { latitude: number; longitude: number } | null => {
    try {
      // Handle formats like "40.7128, -74.0060" or "40.7128,-74.0060"
      const coordMatch = coords.trim().match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);

        // Validate coordinates are within valid ranges
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          console.log('Coordinates parsed:', lat, lng);
          return { latitude: lat, longitude: lng };
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleUseCurrentLocation = async () => {
    setFetchingLocation(true);
    try {
      const location = await LocationService.getCurrentLocation();
      const { latitude, longitude } = location.coords;

      // Save gym with current location
      await GymService.createGym({
        location_type: 'gym',
        latitude,
        longitude,
        radius: 200, // Default 200m radius
      });

      Alert.alert(
        'Success',
        'Your current location has been set as your gym!',
        [
          {
            text: 'OK',
            onPress: async () => {
              // Tutorial already shown, go directly to main app
              router.replace('/(tabs)');
            }
          }
        ]
      );
    } catch (error: any) {
      console.error('Error getting current location:', error);
      const errorMessage = LocationService.getErrorMessage(error);
      Alert.alert('Location Error', errorMessage);
    } finally {
      setFetchingLocation(false);
    }
  };

  const handleSaveGym = async () => {
    if (!coordinates.trim()) {
      Alert.alert('Error', 'Please enter coordinates in the format: latitude, longitude');
      return;
    }

    const parsedCoordinates = parseCoordinates(coordinates.trim());
    if (!parsedCoordinates) {
      Alert.alert(
        'Invalid Coordinates',
        'Please enter valid coordinates in the format:\n40.7128, -74.0060\n\nLatitude should be between -90 and 90\nLongitude should be between -180 and 180'
      );
      return;
    }

    setLoading(true);
    try {
      await GymService.createGym({
        location_type: 'gym',
        latitude: parsedCoordinates.latitude,
        longitude: parsedCoordinates.longitude,
        radius: 200, // Default 200m radius
      });

      // Tutorial already shown, go directly to main app
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error saving gym:', error);
      Alert.alert('Error', 'Failed to save gym location');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPlusCodes = () => {
    setShowWebView(true);
  };

  const handleWebViewNavigationChange = (navState: any) => {
    const { url } = navState;
    console.log('WebView URL:', url);

    // Detect when user has navigated to a specific location
    // Plus Codes URL patterns:
    // - After search: https://plus.codes/[PLUS_CODE] (e.g., https://plus.codes/9C4WXR2X+PX)
    // - The plus code format indicates a search has happened
    const plusCodePattern = /plus\.codes\/([A-Z0-9]{4,}\+[A-Z0-9]{2,})/;
    const hasPlusCode = plusCodePattern.test(url);

    if (hasPlusCode) {
      console.log('User searched for a location (Plus Code detected in URL)');
      // Notify the WebView that a search has occurred
      webViewRef.current?.injectJavaScript(`
        window.searchOccurred = true;
        console.log('Search detected! Now monitoring for coordinates...');
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
          <Text style={styles.title}>SET YOUR GYM</Text>
          <Text style={styles.subtitle}>Choose how to set your gym location</Text>
        </View>
        {/* Option 1: Use Current Location */}
        <View style={styles.optionContainer}>
          <View style={styles.optionHeader}>
            <Navigation size={20} color={colors.accent} />
            <Text style={styles.optionTitle}>OPTION 1: I’M AT THE GYM NOW</Text>
          </View>
          <Text style={styles.optionDescription}>Use your current location as gym location</Text>
          <TouchableOpacity
            style={[styles.primaryButton, fetchingLocation && styles.buttonDisabled]}
            onPress={handleUseCurrentLocation}
            disabled={fetchingLocation || loading}
          >
            {fetchingLocation ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.primaryButtonText}>USE CURRENT LOCATION</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Option 2: Enter Coordinates */}
        <View style={styles.optionContainer}>
          <View style={styles.optionHeader}>
            <MapPin size={20} color={colors.cyan} />
            <Text style={styles.optionTitle}>OPTION 2: ENTER MANUALLY</Text>
          </View>
          <Text style={styles.optionDescription}>Enter your gym’s coordinates</Text>

          <TouchableOpacity
            style={[styles.secondaryButton, (loading || fetchingLocation) && styles.buttonDisabled]}
            onPress={handleOpenPlusCodes}
            disabled={loading || fetchingLocation}
          >
            <Text style={styles.secondaryButtonText}>GET GYM LOCATION</Text>
          </TouchableOpacity>

          <Text style={styles.orText}>OR</Text>

          <TextInput
            style={styles.input}
            value={coordinates}
            onChangeText={setCoordinates}
            placeholder="40.7128, -74.0060"
            placeholderTextColor={colors.textFaint}
            editable={!loading && !fetchingLocation}
          />

          <TouchableOpacity
            style={[styles.secondaryButton, (!coordinates.trim() || loading || fetchingLocation) && styles.buttonDisabled]}
            onPress={handleSaveGym}
            disabled={!coordinates.trim() || loading || fetchingLocation}
          >
            <Text style={styles.secondaryButtonText}>
              {loading ? 'SAVING...' : 'SAVE LOCATION'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* WebView Modal for Plus Codes */}
      <Modal
        visible={showWebView}
        animationType="slide"
        onRequestClose={() => setShowWebView(false)}
      >
        <View style={styles.webViewContainer}>
          <View style={styles.webViewHeader}>
            <Text style={styles.webViewTitle}>Search for your gym</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowWebView(false)}
            >
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
              console.log('Message from WebView:', data);

              try {
                const coords = JSON.parse(data);
                if (coords.latitude && coords.longitude) {
                  const latitude = parseFloat(coords.latitude);
                  const longitude = parseFloat(coords.longitude);

                  if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
                    const coordString = `${latitude}, ${longitude}`;
                    setCoordinates(coordString);
                    setShowWebView(false);

                    Alert.alert(
                      'Location Found!',
                      `Coordinates: ${coordString}\n\nSave this as your gym location?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Save',
                          onPress: async () => {
                            setLoading(true);
                            try {
                              await GymService.createGym({
                                location_type: 'gym',
                                latitude,
                                longitude,
                                radius: 200,
                              });
                              // Tutorial already shown, go directly to main app
                              router.replace('/(tabs)');
                            } catch {
                              Alert.alert('Error', 'Failed to save gym location');
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
                    // Try to find coordinates in the page
                    const bodyText = document.body.innerText;

                    // Look for latitude, longitude pattern (e.g., "12.9716, 77.5946")
                    // Match coordinates with at least 4 decimal places for accuracy
                    const coordMatch = bodyText.match(/(-?\\d+\\.\\d{4,})\\s*,\\s*(-?\\d+\\.\\d{4,})/);

                    if (coordMatch) {
                      const newCoordinates = coordMatch[1] + ',' + coordMatch[2];

                      // Store initial coordinates (user's current location) to ignore them
                      if (!initialCoordinates) {
                        initialCoordinates = newCoordinates;
                        lastCoordinates = newCoordinates;
                        console.log('Initial coordinates captured (will be ignored):', initialCoordinates);
                        return;
                      }

                      // Only send if:
                      // 1. A search has occurred (detected by URL change)
                      // 2. Coordinates changed from last check
                      // 3. New coordinates are different from initial coordinates
                      if (window.searchOccurred &&
                          newCoordinates !== lastCoordinates &&
                          newCoordinates !== initialCoordinates) {

                        lastCoordinates = newCoordinates;

                        console.log('Valid gym coordinates found after search:', newCoordinates);

                        // Send coordinates to React Native
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

                // Check periodically for coordinates
                setInterval(extractCoordinates, 2000);

                // Also check on click events
                document.addEventListener('click', function() {
                  setTimeout(extractCoordinates, 1000);
                });

                // Initial capture of coordinates (but don't send - just store as initial)
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
    marginBottom: 32,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 32,
    justifyContent: 'center',
    flexGrow: 1,
  },
  optionContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  optionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.text,
  },
  optionDescription: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: '#999',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.bg,
  },
  secondaryButton: {
    backgroundColor: colors.cyan,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryButtonText: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.bg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.textFaint,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  orText: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    color: colors.textFaint,
    textAlign: 'center',
    marginVertical: 16,
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
