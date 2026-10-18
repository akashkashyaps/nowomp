import { GymService } from './GymService';

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

  static async verifyGymLocation(): Promise<boolean> {
    try {
      console.log('[LocationService Web] Verifying gym location with mock data...');
      
      // Simulate permission request
      const permissionGranted = await this.simulatePermissionRequest();
      if (!permissionGranted) {
        throw new Error('Location permission denied');
      }

      const currentLocation = this.mockLocation;
      const gym = await GymService.getUserGym();
      
      if (!gym) {
        console.log('[LocationService Web] No gym location set');
        throw new Error('No gym location set');
      }

      const distance = this.calculateDistance(
        currentLocation.coords.latitude,
        currentLocation.coords.longitude,
        gym.latitude,
        gym.longitude
      );

      console.log(`[LocationService Web] Distance to gym: ${distance}m (allowed: ${gym.radius}m)`);
      const isWithinRange = distance <= gym.radius;
      console.log(`[LocationService Web] Location verification: ${isWithinRange ? 'PASS' : 'FAIL'}`);
      
      return isWithinRange;
    } catch (error) {
      console.error('[LocationService Web] Location verification error:', error);
      throw error;
    }
  }

  private static async simulatePermissionRequest(): Promise<boolean> {
    // For web testing, always grant permission
    // In a real web app, you might use the Geolocation API
    console.log('[LocationService Web] Simulating location permission request...');
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async permission request
    console.log('[LocationService Web] Location permission granted (simulated)');
    return true;
  }

  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
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

  // Test helper methods for debugging
  static async testLocationScenarios() {
    console.log('[LocationService Web] Running location test scenarios...');
    
    try {
      // Test scenario 1: Very close to gym
      this.setMockLocation(37.7749, -122.4194);
      const result1 = await this.verifyGymLocation();
      console.log('Scenario 1 (close to gym):', result1);
      
      // Test scenario 2: Far from gym
      this.setMockLocation(40.7128, -74.0060); // New York
      const result2 = await this.verifyGymLocation();
      console.log('Scenario 2 (far from gym):', result2);
      
      return { close: result1, far: result2 };
    } catch (error) {
      console.error('[LocationService Web] Test scenarios error:', error);
      throw error;
    }
  }
}