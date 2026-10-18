import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { WorkoutNotificationNative } from './WorkoutNotificationNative';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export class NotificationService {
  private static workoutNotificationId: string | null = null;

  /**
   * Whether notifications are already allowed. Never shows a prompt: use this
   * from anything that runs by itself (app launch, screen focus), so the user
   * is only ever asked in response to something they did.
   */
  static async hasPermission(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  /** Shows the system prompt if needed. Only call from a user action. */
  static async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }

  static async scheduleWorkoutNotifications(workoutDays: string[], workoutTime: string): Promise<void> {
    if (Platform.OS === 'web') return;

    // Replace only the previous weekly workout reminders.
    await this.cancelByPrefix('weekly-workout-');

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    const [hours, minutes] = workoutTime.split(':').map(Number);
    const now = new Date();
    const currentDay = now.getDay(); // 0-6 (Sunday-Saturday)
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    for (const day of workoutDays) {
      const dayIndex = this.getDayIndex(day);

      // Schedule 3 notifications per workout day
      const notifications = [
        {
          minutesBefore: 60,
          title: '1 Hour to go💪',
          body: 'Wrap up current work, grab pre workout and hydrate. Let\'s get it!'
        },
        {
          minutesBefore: 20,
          title: '20 min to go😨',
          body: 'Wear gym clothes, take your bag and water bottle and walk out the door!'
        },
        {
          minutesBefore: 1,
          title: 'What are you doing?',
          body: 'Start workout now! I\'m losing patience 😡'
        }
      ];

      for (const notification of notifications) {
        const notificationHour = hours;
        const notificationMinute = minutes - notification.minutesBefore;

        let finalHour = notificationHour;
        let finalMinute = notificationMinute;

        if (finalMinute < 0) {
          finalMinute += 60;
          finalHour -= 1;
        }

        if (finalHour < 0) finalHour += 24;

        // Check if this is today and if the notification time has already passed
        // dayIndex is 1-7 (Sun-Sat), currentDay is 0-6 (Sun-Sat)
        const notificationDayJS = (dayIndex - 1 + 7) % 7; // Convert to 0-6
        const isToday = currentDay === notificationDayJS;

        // Skip if it's today and the time has already passed
        if (isToday) {
          const hasPassedToday =
            (currentHour > finalHour) ||
            (currentHour === finalHour && currentMinute >= finalMinute);

          if (hasPassedToday) {
            console.log(`Skipping notification for ${day} at ${finalHour}:${finalMinute.toString().padStart(2, '0')} - time has passed`);
            continue; // Skip this notification
          }
        }

        console.log(`Scheduling notification for ${day} at ${finalHour}:${finalMinute.toString().padStart(2, '0')}`);

        await Notifications.scheduleNotificationAsync({
          identifier: `weekly-workout-${dayIndex}-${notification.minutesBefore}`,
          content: {
            title: notification.title,
            body: notification.body,
          },
          trigger: {
            // expo-notifications requires an explicit trigger type; WEEKLY
            // repeats by definition, so the old `repeats: true` is gone.
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: dayIndex,
            hour: finalHour,
            minute: finalMinute,
          },
        });
      }
    }
  }

  /** Cancel every scheduled notification. Only for "reset everything" paths. */
  static async cancelAllNotifications(): Promise<void> {
    if (Platform.OS === 'web') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  /** Cancel scheduled notifications whose identifier starts with `prefix`. */
  static async cancelByPrefix(prefix: string): Promise<void> {
    if (Platform.OS === 'web') return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier?.startsWith(prefix)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  }

  static async scheduleOneTimeWorkoutNotifications(workoutDate: string, workoutTime: string): Promise<void> {
    if (Platform.OS === 'web') return;

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    // Cancel only notifications for THIS workout date (not all notifications)
    await this.cancelNotificationsForDate(workoutDate);

    const [hours, minutes] = workoutTime.split(':').map(Number);
    const workoutDateTime = new Date(workoutDate + 'T00:00:00');
    workoutDateTime.setHours(hours, minutes, 0, 0);

    const now = new Date();

    // Schedule 3 notifications for this specific workout
    const notifications = [
      {
        minutesBefore: 60,
        title: '1 Hour to go💪',
        body: 'Wrap up current work, grab pre workout and hydrate. Let\'s get it!'
      },
      {
        minutesBefore: 20,
        title: '20 min to go😨',
        body: 'Wear gym clothes, take your bag and water bottle and walk out the door!'
      },
      {
        minutesBefore: 1,
        title: 'What are you doing?',
        body: 'Start workout now! I\'m losing patience 😡'
      }
    ];

    for (const notification of notifications) {
      const notificationTime = new Date(workoutDateTime.getTime() - (notification.minutesBefore * 60 * 1000));

      // Only schedule if the notification time is in the future
      if (notificationTime.getTime() > now.getTime()) {
        console.log(`Scheduling notification "${notification.title}" for ${notificationTime.toLocaleString()}`);

        await Notifications.scheduleNotificationAsync({
          identifier: `workout-${workoutDate}-${notification.minutesBefore}`,
          content: {
            title: notification.title,
            body: notification.body,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: notificationTime,
          },
        });
      } else {
        console.log(`Skipping notification ${notification.minutesBefore} min before - time has passed`);
      }
    }
  }

  /**
   * Cancel notifications for a specific workout date only
   */
  static async cancelNotificationsForDate(workoutDate: string): Promise<void> {
    if (Platform.OS === 'web') return;

    const minutesBefore = [60, 20, 1];
    for (const mins of minutesBefore) {
      try {
        await Notifications.cancelScheduledNotificationAsync(`workout-${workoutDate}-${mins}`);
      } catch {
        // Notification may not exist, that's fine
      }
    }
  }

  static async cancelTodayNotifications(): Promise<void> {
    if (Platform.OS === 'web') return;

    const today = new Date().toISOString().split('T')[0];
    await this.cancelNotificationsForDate(today);
  }

  static async showWorkoutProgressNotification(startTime: Date): Promise<void> {
    if (Platform.OS === 'web') return;

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    // Prefer the foreground service: it survives the app being backgrounded,
    // cannot be swiped away, and shows a live timer. The expo notification
    // below is the fallback for builds without the native module.
    const nativeAvailable = WorkoutNotificationNative.isAvailable();
    console.log(
      `[workout-notif] native foreground service available: ${nativeAvailable}` +
        (nativeAvailable ? '' : ' — falling back to a dismissible notification')
    );
    if (nativeAvailable) {
      WorkoutNotificationNative.startWorkoutNotification(startTime);
      return;
    }

    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '💪 Workout Active',
          body: 'Keep going! Your workout is being tracked.',
          sound: false,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        },
        trigger: null,
      });

      this.workoutNotificationId = notificationId;
      console.log('Workout notification shown:', notificationId);
    } catch (error) {
      console.error('Error showing workout notification:', error);
    }
  }

  static async dismissWorkoutProgressNotification(): Promise<void> {
    if (Platform.OS === 'web') return;

    // Always stop the service, even if the fallback path was used — stopping a
    // service that isn't running is a no-op, and leaving one running would pin
    // the notification forever.
    WorkoutNotificationNative.stopWorkoutNotification();

    try {
      if (this.workoutNotificationId) {
        await Notifications.dismissNotificationAsync(this.workoutNotificationId);
        console.log('Workout notification dismissed:', this.workoutNotificationId);
        this.workoutNotificationId = null;
      }
    } catch (error) {
      console.error('Error dismissing workout notification:', error);
    }
  }

  /**
   * Schedule reminder notifications for redemption mode
   * Sends reminders every 10 hours until workout is started or redemption period ends
   */
  static async scheduleRedemptionReminders(redemptionDeadline: string): Promise<void> {
    if (Platform.OS === 'web') return;

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    // Cancel any existing redemption reminders first
    await this.cancelRedemptionReminders();

    const deadline = new Date(redemptionDeadline);
    const now = new Date();

    // Calculate how many 10-hour intervals fit before the deadline
    const millisecondsUntilDeadline = deadline.getTime() - now.getTime();
    const hoursUntilDeadline = millisecondsUntilDeadline / (1000 * 60 * 60);

    // Schedule reminders every 10 hours
    const intervalHours = 10;
    let reminderCount = 0;

    for (let hours = intervalHours; hours < hoursUntilDeadline; hours += intervalHours) {
      const secondsUntilReminder = hours * 60 * 60;
      reminderCount++;

      const messages = [
        {
          title: '⚠️ Redemption Mode Active',
          body: 'Don\'t forget to complete your redemption workout! Time is ticking.'
        },
        {
          title: '🔥 Redemption Workout Reminder',
          body: 'You\'re in redemption mode. Complete your workout to redeem yourself!'
        },
        {
          title: '💪 Still in Redemption Mode',
          body: 'Your redemption period is running. Get to the gym and complete your workout!'
        },
        {
          title: '⏰ Redemption Mode Reminder',
          body: 'You need to complete a workout to exit redemption mode. Let\'s do this!'
        }
      ];

      const message = messages[reminderCount % messages.length];

      console.log(`Scheduling redemption reminder #${reminderCount} in ${hours} hours`);

      await Notifications.scheduleNotificationAsync({
        identifier: `redemption-reminder-${reminderCount}`,
        content: {
          title: message.title,
          body: message.body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: {
            type: 'redemption_reminder',
            reminderNumber: reminderCount
          }
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsUntilReminder,
          repeats: false,
        },
      });
    }

    console.log(`Scheduled ${reminderCount} redemption reminder notifications`);
  }

  /**
   * Cancel all redemption reminder notifications
   */
  static async cancelRedemptionReminders(): Promise<void> {
    if (Platform.OS === 'web') return;

    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();

    for (const notification of scheduledNotifications) {
      if (notification.identifier?.startsWith('redemption-reminder-')) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }

    console.log('Cancelled all redemption reminder notifications');
  }

  /**
   * Schedule a daily motivational nudge notification
   * Fires once per day at a random hour between 9 AM and 8 PM
   * Called on app startup to keep the schedule fresh
   */
  static async scheduleDailyMotivation(): Promise<void> {
    if (Platform.OS === 'web') return;

    const hasPermission = await this.hasPermission();
    if (!hasPermission) return;

    // Cancel previous motivation notification
    try {
      await Notifications.cancelScheduledNotificationAsync('daily-motivation');
    } catch {
      // May not exist
    }

    // Schedule for a random time tomorrow between 9 AM and 8 PM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const randomHour = 9 + Math.floor(Math.random() * 11); // 9-19
    const randomMinute = Math.floor(Math.random() * 60);
    tomorrow.setHours(randomHour, randomMinute, 0, 0);

    console.log(`Scheduling daily motivation for ${tomorrow.toLocaleString()}`);

    await Notifications.scheduleNotificationAsync({
      identifier: 'daily-motivation',
      content: {
        title: 'Are you working out?',
        body: 'Remember why you started.',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: tomorrow,
      },
    });
  }

  /**
   * One-off evening check-in reminders for a running experiment. Scheduled a
   * week at a time and re-armed whenever the Lab opens, so the window keeps
   * rolling forward without the app needing to run in the background.
   */
  static async scheduleExperimentCheckins(
    reminders: { date: string; hour: number; title: string; body: string }[]
  ): Promise<void> {
    if (Platform.OS === 'web' || reminders.length === 0) return;
    const hasPermission = await this.hasPermission();
    if (!hasPermission) return;

    const now = Date.now();
    for (const r of reminders) {
      const [y, m, d] = r.date.split('-').map(Number);
      const when = new Date(y, m - 1, d, r.hour, 0, 0, 0);
      if (when.getTime() <= now) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `experiment-checkin-${r.date}`,
        content: {
          title: r.title,
          body: r.body,
          data: { route: '/(tabs)/lab' },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
        },
      });
    }
  }

  static async cancelExperimentCheckins(): Promise<void> {
    if (Platform.OS === 'web') return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier?.startsWith('experiment-checkin-')) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  }

  /**
   * Next Sunday at 7pm: "your week in review". One-off and re-armed on every
   * app open, so it always points at the coming Sunday.
   */
  static async scheduleWeeklyRecap(): Promise<void> {
    if (Platform.OS === 'web') return;
    const hasPermission = await this.hasPermission();
    if (!hasPermission) return;
    try {
      await Notifications.cancelScheduledNotificationAsync('weekly-recap');
    } catch {}

    const when = new Date();
    when.setHours(19, 0, 0, 0);
    const daysToSunday = (7 - when.getDay()) % 7;
    when.setDate(when.getDate() + daysToSunday);
    if (when.getTime() <= Date.now()) when.setDate(when.getDate() + 7);

    await Notifications.scheduleNotificationAsync({
      identifier: 'weekly-recap',
      content: {
        title: '📊 Your week in review',
        body: 'Workouts, excuses, sleep and trophies. See how the week went.',
        sound: true,
        data: { route: '/recap' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
  }

  private static getDayIndex(dayName: string): number {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days.indexOf(dayName) + 1; // Expo uses 1-7 for Sunday-Saturday
  }
}