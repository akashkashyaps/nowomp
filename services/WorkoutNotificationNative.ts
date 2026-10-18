import { NativeModules, Platform } from 'react-native';

interface WorkoutNotificationModuleType {
  startWorkoutNotification: (startTimeMillis: number) => void;
  stopWorkoutNotification: () => void;
}

const nativeModule = NativeModules.WorkoutNotificationModule as
  | WorkoutNotificationModuleType
  | undefined;

/**
 * Persistent workout notification, backed by an Android foreground service.
 *
 * Unlike a scheduled notification this one cannot be swiped away, carries a
 * live-counting timer, and keeps the OS from killing the app mid-workout.
 *
 * Every call is guarded. The module is absent on iOS, on web, and in any build
 * made before this native code existed — a missing module must degrade to
 * nothing rather than take a workout down with it.
 */
export class WorkoutNotificationNative {
  /** True when the native module is present and usable. */
  static isAvailable(): boolean {
    return Platform.OS === 'android' && nativeModule != null;
  }

  static startWorkoutNotification(startTime: Date): void {
    if (!this.isAvailable()) return;
    try {
      nativeModule!.startWorkoutNotification(new Date(startTime).getTime());
    } catch (error) {
      console.log('Workout notification service unavailable:', error);
    }
  }

  static stopWorkoutNotification(): void {
    if (!this.isAvailable()) return;
    try {
      nativeModule!.stopWorkoutNotification();
    } catch (error) {
      console.log('Could not stop workout notification service:', error);
    }
  }
}
