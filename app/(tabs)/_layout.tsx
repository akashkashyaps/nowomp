import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { PlatformPressable } from '@react-navigation/elements';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { TourTarget } from '@/components/tour/Tour';
import { Home, Activity, FlaskConical, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DailyMaintenanceService } from '@/services/DailyMaintenanceService';
import { NotificationService } from '@/services/NotificationService';

import { colors, fonts } from '@/constants/theme';
/** Notification taps already acted on, so a remount doesn't re-open them. */
const handledNotifications = new Set<string>();

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  // Run maintenance on app startup and when app comes to foreground
  useEffect(() => {
    // Run immediately on mount
    DailyMaintenanceService.checkAndRunMaintenance();
    NotificationService.scheduleDailyMotivation();
    NotificationService.scheduleWeeklyRecap().catch(() => {});

    // Tapping a notification that carries a route opens that screen. The last
    // response is also checked so a tap that cold-started the app still lands.
    const openFromNotification = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledNotifications.has(id + response.notification.date)) return;
      handledNotifications.add(id + response.notification.date);
      const route = response.notification.request.content.data?.route;
      if (typeof route === 'string') router.push(route as never);
    };
    Notifications.getLastNotificationResponseAsync().then(openFromNotification).catch(() => {});
    const tapSub = Notifications.addNotificationResponseReceivedListener(openFromNotification);

    // NOTE: health sync deliberately does NOT run here.
    //
    // Syncing on launch raced the Health tab's own focus sync, and both open
    // write transactions on expo-sqlite's single connection. The Health tab
    // syncs on focus, which is sufficient — restore this only with evidence
    // that the two cannot overlap.

    // Run when app comes to foreground
    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          DailyMaintenanceService.checkAndRunMaintenance();
        }
      },
    );

    return () => {
      subscription?.remove();
      tapSub.remove();
    };
  }, []);

  const handleTabPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.card,
          height: 70 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 12,
          paddingHorizontal: 8,
          marginBottom: Platform.OS === 'android' ? 16 : 0,
          marginHorizontal: Platform.OS === 'android' ? 16 : 0,
          borderRadius: Platform.OS === 'android' ? 16 : 0,
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: -4,
          },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 20,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: {
          fontFamily: fonts.bodySemi,
          fontSize: 11,
          marginTop: -2,
          marginBottom: 2,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
      }}
    >
      {/* Four tabs. Plan and Settings open as full screens from Today and You,
          which keeps the bar uncluttered without losing any screen. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'TODAY',
          tabBarIcon: ({ size, color }) => (
            <Home size={size} color={color} strokeWidth={2.5} />
          ),
        }}
        listeners={{
          tabPress: handleTabPress,
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          tabBarButton: (props) => (
            <TourTabButton tourId="tab.health" {...props} />
          ),
          title: 'HEALTH',
          tabBarIcon: ({ size, color }) => (
            <Activity size={size} color={color} strokeWidth={2.5} />
          ),
        }}
        listeners={{
          tabPress: handleTabPress,
        }}
      />
      <Tabs.Screen
        name="lab"
        options={{
          tabBarButton: (props) => (
            <TourTabButton tourId="tab.lab" {...props} />
          ),
          title: 'LAB',
          tabBarIcon: ({ size, color }) => (
            <FlaskConical size={size} color={color} strokeWidth={2.5} />
          ),
        }}
        listeners={{
          tabPress: handleTabPress,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          tabBarButton: (props) => (
            <TourTabButton tourId="tab.you" {...props} />
          ),
          title: 'YOU',
          tabBarIcon: ({ size, color }) => (
            <User size={size} color={color} strokeWidth={2.5} />
          ),
        }}
        listeners={{
          tabPress: handleTabPress,
        }}
      />
    </Tabs>
  );
}

/** The default tab button, wrapped so the spotlight tour can point at it. */
function TourTabButton({
  tourId,
  style,
  ...props
}: BottomTabBarButtonProps & { tourId: string }) {
  return (
    <TourTarget id={tourId} style={{ flex: 1 }}>
      <PlatformPressable {...props} style={[style, { flex: 1 }]} />
    </TourTarget>
  );
}
