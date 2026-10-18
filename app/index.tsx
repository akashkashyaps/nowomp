import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { UserService } from '@/services/UserService';
import { database } from '@/database/database';
import { DailyMaintenanceService } from '@/services/DailyMaintenanceService';

import { colors } from '@/constants/theme';
export default function IndexScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize database
      await database.initialize();
      
      // Check if user exists
      const user = await UserService.getCurrentUser();
      
      if (user) {
        // Check if there's a missed workout that needs an excuse
        const pendingExcuseDate = await DailyMaintenanceService.getPendingExcuseDate();

        if (pendingExcuseDate) {
          // Lock the app - user must provide excuse before continuing
          console.log('🔒 APP LOCKED - Missed workout on:', pendingExcuseDate);
          if (isMounted.current) {
            router.replace(`/mandatory-excuse?date=${pendingExcuseDate}`);
          }
        } else {
          // No pending excuse - proceed normally
          if (isMounted.current) {
            router.replace('/(tabs)');
          }
        }
      } else {
        // New user - straight to setup. The rules are taught by the spotlight
        // tour on the home screen instead of a wall of text up front.
        if (isMounted.current) {
          router.replace('/onboarding');
        }
      }
    } catch (error) {
      console.error('App initialization error:', error);
      if (isMounted.current) {
        router.replace('/onboarding');
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  };

  if (isLoading) {
    return <View style={styles.container} />;
  }

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
