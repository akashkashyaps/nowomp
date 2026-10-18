import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput, Modal } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ScheduledWorkoutService } from '@/services/ScheduledWorkoutService';
import { NotificationService } from '@/services/NotificationService';
import { Clock, Plus, Trash2, Edit3, X } from 'lucide-react-native';
import { ScheduledWorkout } from '@/database/database';
import { ScreenHeader } from '@/components/ScreenHeader';

import { colors, fonts } from '@/constants/theme';
export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const [scheduledWorkouts, setScheduledWorkouts] = useState<ScheduledWorkout[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('18:00');
  const [markedDates, setMarkedDates] = useState<{[key: string]: any}>({});

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [editingWorkout, setEditingWorkout] = useState<ScheduledWorkout | null>(null);
  const [editTime, setEditTime] = useState<string>('18:00');

  useEffect(() => {
    loadSchedule();
  }, []);

  useEffect(() => {
    updateMarkedDates();
    // Recomputes only when the schedule changes; updateMarkedDates is
    // re-created each render, so listing it would run this every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledWorkouts]);

  const loadSchedule = async () => {
    try {
      const workouts = await ScheduledWorkoutService.getAllScheduledWorkouts();
      setScheduledWorkouts(workouts);
    } catch (error) {
      console.error('Error loading scheduled workouts:', error);
    }
  };

  const updateMarkedDates = () => {
    const marked: {[key: string]: any} = {};

    if (scheduledWorkouts && Array.isArray(scheduledWorkouts)) {
      scheduledWorkouts.forEach(workout => {
        if (workout && workout.workout_date) {
          marked[workout.workout_date] = {
            selected: true,
            selectedColor: colors.accent,
            selectedTextColor: colors.bg
          };
        }
      });
    }

    if (selectedDate && !marked[selectedDate]) {
      marked[selectedDate] = {
        selected: true,
        selectedColor: colors.cyan,
        selectedTextColor: colors.bg
      };
    }

    setMarkedDates(marked);
  };

  const onDayPress = (day: any) => {
    setSelectedDate(day.dateString);
  };

  const addWorkout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!selectedDate || !selectedTime) {
      Alert.alert('Error', 'Please select a date and time');
      return;
    }

    const workoutDate = selectedDate; // Store before clearing
    console.log('=== CALENDAR DEBUG ===');
    console.log('Selected date from calendar:', selectedDate);
    console.log('Selected time:', selectedTime);
    console.log('======================');
    
    try {
      await ScheduledWorkoutService.addScheduledWorkout(selectedDate, selectedTime);
      await loadSchedule(); // Reload to get the updated data
      setSelectedDate('');
      // Schedule one-time notifications for this specific workout
      await NotificationService.scheduleOneTimeWorkoutNotifications(workoutDate, selectedTime);

      Alert.alert('✅ WORKOUT SCHEDULED', 'Your workout has been scheduled successfully!');
    } catch (error: any) {
      console.error('Error adding workout:', error);
      if (error.message?.includes('already completed')) {
        Alert.alert('Already Completed! 💪', error.message);
      } else if (error.message?.includes('already made an excuse')) {
        Alert.alert('Already Excused 😔', error.message);
      } else {
        Alert.alert('Error', error.message || 'Failed to add workout');
      }
    }
  };

  const removeWorkout = async (dateToRemove: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await ScheduledWorkoutService.removeScheduledWorkout(dateToRemove);
      await loadSchedule(); // Reload to get the updated data
    } catch (error: any) {
      console.error('Error removing workout:', error);
      Alert.alert('Error', 'Failed to remove workout');
    }
  };

  const clearAllWorkouts = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Clear All Workouts',
      'This will remove all scheduled workouts. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await ScheduledWorkoutService.clearAllScheduledWorkouts();
              await loadSchedule();
              setSelectedDate('');
            } catch (error) {
              console.error('Error clearing workouts:', error);
              Alert.alert('Error', 'Failed to clear workouts');
            }
          }
        }
      ]
    );
  };

  const openEditModal = (workout: ScheduledWorkout) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditingWorkout(workout);
    setEditTime(workout.workout_time);
    setEditModalVisible(true);
  };

  const closeEditModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditModalVisible(false);
    setEditingWorkout(null);
    setEditTime('18:00');
  };

  const saveEditedWorkout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!editingWorkout || !editTime) {
      Alert.alert('Error', 'Please enter a valid time');
      return;
    }

    try {
      // Update the workout time
      await ScheduledWorkoutService.updateScheduledWorkout(editingWorkout.workout_date, editTime);

      // Reschedule notifications for the updated time
      await NotificationService.scheduleOneTimeWorkoutNotifications(editingWorkout.workout_date, editTime);

      // Reload schedule
      await loadSchedule();

      // Close modal
      closeEditModal();

      Alert.alert('✅ WORKOUT UPDATED', 'Your workout time has been updated successfully!');
    } catch (error: any) {
      console.error('Error updating workout:', error);
      Alert.alert('Error', error.message || 'Failed to update workout');
    }
  };

  const formatTime = (time: string) => {
    if (!time || typeof time !== 'string') return '12:00 PM';
    
    const timeParts = time.split(':');
    if (timeParts.length < 2) return '12:00 PM';
    
    const [hours, minutes] = timeParts;
    const hour = parseInt(hours) || 0;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes || '00'} ${ampm}`;
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="PLAN" subtitle="SELECT DATE & TIME FOR WORKOUTS" />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          {/* Calendar Section */}
          <View style={styles.calendarSection}>
            <Calendar
              onDayPress={onDayPress}
              markedDates={markedDates}
              minDate={new Date().toISOString().split('T')[0]}
              theme={{
                backgroundColor: colors.bg,
                calendarBackground: colors.card,
                textSectionTitleColor: colors.accent,
                selectedDayBackgroundColor: colors.accent,
                selectedDayTextColor: colors.bg,
                todayTextColor: colors.cyan,
                dayTextColor: colors.text,
                textDisabledColor: colors.textFaint,
                dotColor: colors.accent,
                selectedDotColor: colors.bg,
                arrowColor: colors.accent,
                monthTextColor: colors.text,
                indicatorColor: colors.accent,
                textDayFontFamily: 'Inter-SemiBold',
                textMonthFontFamily: 'Anton-Regular',
                textDayHeaderFontFamily: 'Inter-Bold',
                textDayFontSize: 16,
                textMonthFontSize: 18,
                textDayHeaderFontSize: 14,
              }}
              style={styles.calendar}
            />
          </View>

          {/* Time Picker Section */}
          <View style={styles.timeSection}>
            <View style={styles.timeSectionHeader}>
              <Clock size={20} color={colors.accent} strokeWidth={2.5} />
              <Text style={styles.timeSectionTitle}>SET TIME</Text>
            </View>

            {selectedDate && (
              <View style={styles.selectedDateContainer}>
                <Text style={styles.selectedDateLabel}>Selected Date:</Text>
                <Text style={styles.selectedDateText}>
                  {new Date(selectedDate).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </Text>
              </View>
            )}

            <View style={styles.timeInputContainer}>
              <TextInput
                style={styles.timeInput}
                value={selectedTime}
                onChangeText={setSelectedTime}
                placeholder="18:00"
                placeholderTextColor={colors.textFaint}
                maxLength={5}
              />
              <Text style={styles.timeFormat}>24hr format</Text>
            </View>

            <TouchableOpacity 
              style={[styles.addButton, !selectedDate && styles.buttonDisabled]}
              onPress={addWorkout}
              disabled={!selectedDate}
            >
              <Plus size={20} color={colors.bg} strokeWidth={2.5} />
              <Text style={styles.addButtonText}>ADD WORKOUT</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Scheduled Workouts List */}
        {scheduledWorkouts.length > 0 && (
          <View style={styles.workoutsSection}>
            <Text style={styles.workoutsSectionTitle}>SCHEDULED WORKOUTS</Text>
            <View style={styles.workoutsList}>
              {scheduledWorkouts && scheduledWorkouts.length > 0 && scheduledWorkouts
                .filter(workout => workout && workout.workout_date && workout.workout_time)
                .sort((a, b) => new Date(a.workout_date).getTime() - new Date(b.workout_date).getTime())
                .map((workout, index) => (
                  <View key={`${workout.workout_date}-${index}`} style={styles.workoutItem}>
                    <View style={styles.workoutInfo}>
                      <Text style={styles.workoutDate}>
                        {new Date(workout.workout_date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </Text>
                      <Text style={styles.workoutTime}>{formatTime(workout.workout_time)}</Text>
                    </View>
                    <View style={styles.workoutActions}>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => openEditModal(workout)}
                      >
                        <Edit3
                          size={18}
                          color={colors.cyan}
                          strokeWidth={2.5}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => removeWorkout(workout.workout_date)}
                      >
                        <Trash2
                          size={18}
                          color={colors.danger}
                          strokeWidth={2.5}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.clearAllButton}
              onPress={clearAllWorkouts}
            >
              <Text style={styles.clearAllButtonText}>CLEAR ALL</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            Selected workouts will automatically schedule notifications. You can add, remove, or change scheduled workouts anytime.
          </Text>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>EDIT WORKOUT</Text>
              <TouchableOpacity onPress={closeEditModal} style={styles.closeButton}>
                <X size={24} color={colors.text} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {editingWorkout && (
              <View style={styles.modalBody}>
                <Text style={styles.modalDateLabel}>Date:</Text>
                <Text style={styles.modalDateText}>
                  {new Date(editingWorkout.workout_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric'
                  })}
                </Text>

                <View style={styles.modalTimeSection}>
                  <Text style={styles.modalTimeLabel}>New Time:</Text>
                  <TextInput
                    style={styles.modalTimeInput}
                    value={editTime}
                    onChangeText={setEditTime}
                    placeholder="18:00"
                    placeholderTextColor={colors.textFaint}
                    maxLength={5}
                  />
                  <Text style={styles.modalTimeFormat}>24hr format (HH:MM)</Text>
                </View>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={closeEditModal}
                  >
                    <Text style={styles.modalCancelButtonText}>CANCEL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalSaveButton}
                    onPress={saveEditedWorkout}
                  >
                    <Text style={styles.modalSaveButtonText}>SAVE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
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
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 36,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  legendText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  calendarSection: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 20,
  },
  calendar: {
    borderRadius: 8,
  },
  timeSection: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 32,
    gap: 16,
  },
  timeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  timeSectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.accent,
  },
  selectedDateContainer: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedDateLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  selectedDateText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.cyan,
  },
  timeInputContainer: {
    gap: 8,
  },
  timeInput: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontFamily: fonts.numeric,
    color: colors.text,
    textAlign: 'center',
  },
  timeFormat: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  workoutsSection: {
    marginBottom: 32,
  },
  workoutsSectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.accent,
    marginBottom: 16,
  },
  workoutsList: {
    gap: 12,
    marginBottom: 20,
  },
  workoutItem: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  workoutInfo: {
    flex: 1,
  },
  workoutDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  workoutDate: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.text,
  },
  workoutLockIndicator: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  workoutTime: {
    fontFamily: fonts.numeric,
    fontSize: 14,
    color: colors.accent,
  },
  workoutActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockToggleButton: {
    padding: 8,
  },
  editButton: {
    padding: 8,
  },
  removeButton: {
    padding: 8,
  },
  lockedWorkoutItem: {
    borderColor: colors.danger,
    backgroundColor: colors.card,
  },
  newWorkoutItem: {
    borderColor: colors.accent,
    backgroundColor: colors.card,
    borderWidth: 2,
  },
  newWorkoutIndicator: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newWorkoutText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.bg,
  },
  prominentLockButton: {
    backgroundColor: '#FFE93E',
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#FFB93E',
  },
  prominentLockButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
  },
  clearAllButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.danger,
    paddingVertical: 12,
    borderRadius: 8,
  },
  clearAllButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
  },
  disabledText: {
    color: colors.textFaint,
  },
  infoContainer: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Edit Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    borderWidth: 2,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.accent,
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
    gap: 16,
  },
  modalDateLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  modalDateText: {
    fontFamily: fonts.bodySemi,
    fontSize: 18,
    color: colors.text,
    marginBottom: 8,
  },
  modalTimeSection: {
    gap: 8,
  },
  modalTimeLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.accent,
  },
  modalTimeInput: {
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontFamily: fonts.numeric,
    color: colors.text,
    textAlign: 'center',
  },
  modalTimeFormat: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.textFaint,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.text,
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSaveButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
  },
});