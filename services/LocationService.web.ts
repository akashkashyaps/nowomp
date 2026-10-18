import { PlaceService, type Place } from './PlaceService';

// Mock location object for web testing
interface MockLocationObject {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

export class LocationService {
  // Mock location for testing - defaulting to a location in San Francisco
  private static mockLocation: MockLocationObject = {
    coords: {
      latitude: 37.7749,
      longitude: -122.4194,
      altitude: null,
      accuracy: 5,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  };

  static setMockLocation(latitude: number, longitude: number) {
    this.mockLocation = {
      coords: {
        latitude,
        longitude,
        altitude: null,
        accuracy: 5,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };
    console.log(`[LocationService Web] Mock location set to: ${latitude}, ${longitude}`);
  }

  static async findCurrentPlace(): Promise<Place | null> {
    const permissionGranted = await this.simulatePermissionRequest();
    if (!permissionGranted) throw new Error('Location permission denied');
    const places = await PlaceService.list();
    if (places.length === 0) throw new Error('Add a place first: Settings → Places.');
    const { latitude, longitude } = this.mockLocation.coords;
    return PlaceService.match(places, latitude, longitude);
  }

  static getErrorMessage(error: any): string {
    return error?.userMessage || error?.message || 'Unable to verify location. Please try again.';
  }

  private static async simulatePermissionRequest(): Promise<boolean> {
    // For web testing, always grant permission
    // In a real web app, you might use the Geolocation API
    console.log('[LocationService Web] Simulating location permission request...');
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async permission request
    console.log('[LocationService Web] Location permission granted (simulated)');
    return true;
  }

  static async getCurrentLocation(): Promise<MockLocationObject> {
    console.log('[LocationService Web] Getting current location (mock)...');
    
    const permissionGranted = await this.simulatePermissionRequest();
    if (!permissionGranted) {
      throw new Error('Location permission denied');
    }

    // Update timestamp to current time
    this.mockLocation.timestamp = Date.now();
    console.log('[LocationService Web] Returning mock location:', this.mockLocation.coords);
    
    return this.mockLocation;
  }
}
