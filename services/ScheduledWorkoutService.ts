import { database, ScheduledWorkout } from '@/database/database';
import { UserService } from './UserService';

export class ScheduledWorkoutService {
  static async addScheduledWorkout(workoutDate: string, workoutTime: string): Promise<ScheduledWorkout> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    
    if (!user) throw new Error('No user found');

    console.log('=== SCHEDULED WORKOUT SERVICE DEBUG ===');
    console.log('Storing workout date:', workoutDate);
    console.log('Storing workout time:', workoutTime);
    console.log('User ID:', user.id);

    // CRITICAL: Check if this day is already "resolved" (workout completed or excuse made)
    // This prevents streak manipulation by scheduling multiple workouts on the same day
    const [completedWorkout, existingSkip] = await Promise.all([
      db.getFirstAsync(
        'SELECT * FROM workouts WHERE user_id = ? AND workout_date = ? AND status = ?',
        [user.id, workoutDate, 'completed']
      ),
      db.getFirstAsync(
        'SELECT * FROM skips WHERE user_id = ? AND skip_date = ?',
        [user.id, workoutDate]
      )
    ]);

    if (completedWorkout) {
      throw new Error('Cannot schedule workout - you already completed a workout on this date! 💪');
    }

    if (existingSkip) {
      throw new Error('Cannot schedule workout - you already made an excuse for this date! 😔');
    }

    // First, let's check if a workout already exists for this date
    const existingWorkout = await db.getFirstAsync<ScheduledWorkout>(
      'SELECT * FROM scheduled_workouts WHERE user_id = ? AND workout_date = ?',
      [user.id, workoutDate]
    );
    console.log('Existing workout found:', existingWorkout);

    const result = await db.runAsync(
      'INSERT OR REPLACE INTO scheduled_workouts (user_id, workout_date, workout_time, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [user.id, workoutDate, workoutTime]
    );

    console.log('Database operation result:', result);

    // Wait a bit to ensure the transaction is committed
    await new Promise(resolve => setTimeout(resolve, 100));

    let scheduledWorkout = await db.getFirstAsync<ScheduledWorkout>(
      'SELECT * FROM scheduled_workouts WHERE user_id = ? AND workout_date = ?',
      [user.id, workoutDate]
    );

    console.log('Retrieved scheduled workout after insert:', scheduledWorkout);

    // If still not found, try querying by ID
    if (!scheduledWorkout && result.lastInsertRowId) {
      scheduledWorkout = await db.getFirstAsync<ScheduledWorkout>(
        'SELECT * FROM scheduled_workouts WHERE id = ?',
        [result.lastInsertRowId]
      );
      console.log('Retrieved scheduled workout by ID:', scheduledWorkout);
    }

    // Final verification - check all workouts for this user
    const allUserWorkouts = await db.getAllAsync<ScheduledWorkout>(
      'SELECT * FROM scheduled_workouts WHERE user_id = ?',
      [user.id]
    );
    console.log('All user workouts after insert:', allUserWorkouts);
    console.log('=======================================');

    if (!scheduledWorkout) throw new Error('Failed to create scheduled workout');

    // Only increment schedule changes counter if we're REPLACING an existing workout with a different time
    // This happens when user changes the time of an already scheduled workout
    if (existingWorkout && existingWorkout.workout_time !== workoutTime) {
      await UserService.incrementScheduleChanges();
      console.log('Schedule time changed - incrementing counter');
    }

    return scheduledWorkout;
  }

  static async removeScheduledWorkout(workoutDate: string): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) throw new Error('No user found');

    await db.runAsync(
      'DELETE FROM scheduled_workouts WHERE user_id = ? AND workout_date = ?',
      [user.id, workoutDate]
    );

    // Do NOT increment counter - removing a workout is not changing the schedule time
  }

  static async getScheduledWorkout(workoutDate: string): Promise<ScheduledWorkout | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return null;

    const workout = await db.getFirstAsync<ScheduledWorkout>(
      'SELECT * FROM scheduled_workouts WHERE user_id = ? AND workout_date = ?',
      [user.id, workoutDate]
    );

    return workout || null;
  }

  static async getAllScheduledWorkouts(): Promise<ScheduledWorkout[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return [];

    const workouts = await db.getAllAsync<ScheduledWorkout>(
      'SELECT * FROM scheduled_workouts WHERE user_id = ? ORDER BY workout_date ASC',
      [user.id]
    );

    return workouts;
  }

  static async updateScheduledWorkout(workoutDate: string, newTime: string): Promise<ScheduledWorkout> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) throw new Error('No user found');

    await db.runAsync(
      'UPDATE scheduled_workouts SET workout_time = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND workout_date = ?',
      [newTime, user.id, workoutDate]
    );

    const updatedWorkout = await this.getScheduledWorkout(workoutDate);
    if (!updatedWorkout) throw new Error('Failed to update workout');

    // Increment schedule changes counter
    await UserService.incrementScheduleChanges();

    return updatedWorkout;
  }

  static async clearAllScheduledWorkouts(): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) throw new Error('No user found');

    await db.runAsync(
      'DELETE FROM scheduled_workouts WHERE user_id = ?',
      [user.id]
    );

    // Do NOT increment counter - clearing workouts is not changing schedule times
  }
}