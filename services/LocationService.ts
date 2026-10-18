import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { PlaceService, type Place } from './PlaceService';

export type LocationError =
  | 'SERVICES_DISABLED'
  | 'PERMISSION_DENIED'
  | 'PERMISSION_DENIED_FOREVER'
  | 'APPROXIMATE_LOCATION_ONLY'
  | 'TIMEOUT'
  | 'WEAK_SIGNAL'
  | 'BATTERY_OPTIMIZATION'
  | 'NO_GYM_SET'
  | 'UNKNOWN';

export interface LocationErrorDetails {
  type: LocationError;
  message: string;
  userMessage: string;
  canRetry: boolean;
  requiresSettings: boolean;
}

export class LocationService {
  private static readonly HIGH_ACCURACY_TIMEOUT = 8000; // 8 seconds
  private static readonly BALANCED_ACCURACY_TIMEOUT = 5000; // 5 seconds
  private static readonly LOW_ACCURACY_TIMEOUT = 3000; // 3 seconds

  /**
   * The saved place you're standing at right now (the closest one whose
   * radius contains you), or null if you aren't at any of them.
   */
  static async findCurrentPlace(): Promise<Place | null> {
    try {
      const places = await PlaceService.list();
      if (places.length === 0) {
        throw this.createError('NO_GYM_SET', 'No place has been set');
      }

      const servicesEnabled = await this.checkLocationServicesEnabled();
      if (!servicesEnabled) {
        throw this.createError('SERVICES_DISABLED', 'Location services are disabled');
      }

      await this.ensurePermissions();
      const { latitude, longitude } = (await this.getCurrentLocationWithFallback()).coords;
      return PlaceService.match(places, latitude, longitude);
    } catch (error: any) {
      console.error('Location verification error:', error);
      throw error;
    }
  }

  /**
   * Get current location for gym setup (used during onboarding)
   */
  static async getCurrentLocation(): Promise<Location.LocationObject> {
    // Check if location services are enabled
    const servicesEnabled = await this.checkLocationServicesEnabled();
    if (!servicesEnabled) {
      throw this.createError('SERVICES_DISABLED', 'Location services are disabled');
    }

    // Check and request permissions
    await this.ensurePermissions();

    // Get location with fallback
    return await this.getCurrentLocationWithFallback();
  }

  /**
   * Check if location services are enabled at system level
   */
  static async checkLocationServicesEnabled(): Promise<boolean> {
    try {
      return await Location.hasServicesEnabledAsync();
    } catch (error) {
      console.error('Error checking location services:', error);
      return false;
    }
  }

  /**
   * Check current permission status without requesting
   */
  static async getPermissionStatus(): Promise<Location.PermissionStatus> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status;
    } catch (error) {
      console.error('Error getting permission status:', error);
      return Location.PermissionStatus.UNDETERMINED;
    }
  }

  /**
   * Ensure we have proper location permissions
   */
  private static async ensurePermissions(): Promise<void> {
    // Check current status first
    const currentStatus = await this.getPermissionStatus();

    if (currentStatus === Location.PermissionStatus.GRANTED) {
      // Check if it's approximate location on Android 12+
      if (Platform.OS === 'android' && Platform.Version >= 31) {
        // Accuracy lives under the platform-specific `android` field and is a
        // string literal, not the Accuracy enum — the previous check compared
        // an undefined property against an enum and so never fired.
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.android?.accuracy === 'coarse') {
          throw this.createError(
            'APPROXIMATE_LOCATION_ONLY',
            'Only approximate location granted. Precise location required for gym verification.'
          );
        }
      }
      return;
    }

    if (currentStatus === Location.PermissionStatus.DENIED && Platform.OS === 'android') {
      // On Android, DENIED means permanently denied (user checked "Don't ask again")
      throw this.createError(
        'PERMISSION_DENIED_FOREVER',
        'Location permission permanently denied. Please enable in Settings.'
      );
    }

    // Request permission
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== Location.PermissionStatus.GRANTED) {
      throw this.createError('PERMISSION_DENIED', 'Location permission denied');
    }
  }

  /**
   * Get location with timeout and fallback strategy
   */
  private static async getCurrentLocationWithFallback(): Promise<Location.LocationObject> {
    // Try high accuracy first (GPS-based)
    try {
      console.log('Attempting high accuracy location...');
      return await this.getLocationWithTimeout(
        Location.Accuracy.High,
        this.HIGH_ACCURACY_TIMEOUT
      );
    } catch (error: any) {
      console.log('High accuracy failed, trying balanced...', error.message);

      // Fallback to balanced (GPS + Network)
      try {
        return await this.getLocationWithTimeout(
          Location.Accuracy.Balanced,
          this.BALANCED_ACCURACY_TIMEOUT
        );
      } catch (error2: any) {
        console.log('Balanced accuracy failed, trying low...', error2.message);

        // Last resort: low accuracy (Network only)
        try {
          return await this.getLocationWithTimeout(
            Location.Accuracy.Low,
            this.LOW_ACCURACY_TIMEOUT
          );
        } catch {
          throw this.createError('WEAK_SIGNAL', 'Unable to determine location. Please try moving to an open area.');
        }
      }
    }
  }

  /**
   * Get location with timeout wrapper
   */
  private static async getLocationWithTimeout(
    accuracy: Location.Accuracy,
    timeout: number
  ): Promise<Location.LocationObject> {
    return Promise.race([
      Location.getCurrentPositionAsync({
        accuracy,
        mayShowUserSettingsDialog: true,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Location request timeout')), timeout)
      ),
    ]);
  }

  /**
   * Create a structured error with user-friendly messages
   */
  private static createError(type: LocationError, message: string): LocationErrorDetails & Error {
    const errorDetails = this.getErrorDetails(type, message);
    const error = new Error(message) as LocationErrorDetails & Error;
    Object.assign(error, errorDetails);
    return error;
  }

  /**
   * Get detailed error information for display
   */
  private static getErrorDetails(type: LocationError, message: string): LocationErrorDetails {
    const details: Record<LocationError, Omit<LocationErrorDetails, 'type'>> = {
      SERVICES_DISABLED: {
        message: 'Location services are disabled on this device',
        userMessage: 'Location services are turned off. Please enable them in your device Settings.',
        canRetry: false,
        requiresSettings: true,
      },
      PERMISSION_DENIED: {
        message: 'Location permission denied',
        userMessage: 'Location permission is required to verify you\'re at one of your places. Please grant permission.',
        canRetry: true,
        requiresSettings: false,
      },
      PERMISSION_DENIED_FOREVER: {
        message: 'Location permission permanently denied',
        userMessage: 'Location permission is blocked. Go to Settings > Apps > NoWomp > Permissions and enable Location.',
        canRetry: false,
        requiresSettings: true,
      },
      APPROXIMATE_LOCATION_ONLY: {
        message: 'Only approximate location granted',
        userMessage: 'Precise location is required to check you\'re at your place. Please go to Settings > Apps > NoWomp > Permissions and select "Precise" location.',
        canRetry: false,
        requiresSettings: true,
      },
      TIMEOUT: {
        message: 'Location request timed out',
        userMessage: 'GPS is taking too long. Try moving to an open area with clear sky view.',
        canRetry: true,
        requiresSettings: false,
      },
      WEAK_SIGNAL: {
        message: 'Weak GPS signal',
        userMessage: 'Can\'t get accurate location. Try moving outdoors or near a window.',
        canRetry: true,
        requiresSettings: false,
      },
      BATTERY_OPTIMIZATION: {
        message: 'Battery optimization limiting GPS',
        userMessage: 'Battery saver may be limiting GPS accuracy. Consider disabling battery optimization for this app.',
        canRetry: true,
        requiresSettings: true,
      },
      NO_GYM_SET: {
        message: 'No place set',
        userMessage: 'Add a place first: Settings → Places.',
        canRetry: false,
        requiresSettings: false,
      },
      UNKNOWN: {
        message: message || 'Unknown location error',
        userMessage: 'Unable to verify location. Please try again.',
        canRetry: true,
        requiresSettings: false,
      },
    };

    return {
      type,
      ...details[type],
    };
  }

  /**
   * Get user-friendly error message from error object
   */
  static getErrorMessage(error: any): string {
    if (error && typeof error === 'object' && 'userMessage' in error) {
      return error.userMessage;
    }

    // Fallback for unknown errors
    if (error?.message) {
      return error.message;
    }

    return 'Unable to verify location. Please try again.';
  }
}
