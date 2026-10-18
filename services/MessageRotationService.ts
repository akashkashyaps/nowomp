import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOTIVATIONAL_MESSAGES } from '../data/motivationalMessages';

const STORAGE_KEY = '@message_rotation_state';

interface MessageRotationState {
  usedIndices: number[];
  currentCycle: number;
}

export class MessageRotationService {
  /**
   * Get a random motivational message that hasn't been shown in the current cycle
   * Resets the cycle when all 120 messages have been used
   */
  static async getRandomMessage(): Promise<string> {
    try {
      const state = await this.getState();
      const totalMessages = MOTIVATIONAL_MESSAGES.length;

      // If all messages have been used, reset the cycle
      if (state.usedIndices.length >= totalMessages) {
        state.usedIndices = [];
        state.currentCycle += 1;
      }

      // Get available message indices
      const availableIndices = Array.from({ length: totalMessages }, (_, i) => i)
        .filter(index => !state.usedIndices.includes(index));

      // Select random message from available ones
      const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      const message = MOTIVATIONAL_MESSAGES[randomIndex];

      // Mark this message as used
      state.usedIndices.push(randomIndex);
      await this.saveState(state);

      return message;
    } catch (error) {
      console.error('Error getting random message:', error);
      // Fallback to a random message without tracking
      return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
    }
  }

  /**
   * Replace placeholders in the message with actual values
   */
  static replacePlaceholders(
    message: string,
    values: {
      minutes?: number;
      streak?: number;
      total_week?: number;
    }
  ): string {
    let result = message;

    if (values.minutes !== undefined) {
      result = result.replace(/{minutes}/g, values.minutes.toString());
    }

    if (values.streak !== undefined) {
      result = result.replace(/{streak}/g, values.streak.toString());
    }

    if (values.total_week !== undefined) {
      result = result.replace(/{total_week}/g, values.total_week.toString());
    }

    return result;
  }

  /**
   * Get the current rotation state from storage
   */
  private static async getState(): Promise<MessageRotationState> {
    try {
      const stateJson = await AsyncStorage.getItem(STORAGE_KEY);

      if (stateJson) {
        return JSON.parse(stateJson);
      }

      // Return initial state if none exists
      return {
        usedIndices: [],
        currentCycle: 1,
      };
    } catch (error) {
      console.error('Error getting message rotation state:', error);
      return {
        usedIndices: [],
        currentCycle: 1,
      };
    }
  }

  /**
   * Save the rotation state to storage
   */
  private static async saveState(state: MessageRotationState): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving message rotation state:', error);
    }
  }

  /**
   * Get statistics about message rotation (useful for debugging/testing)
   */
  static async getRotationStats(): Promise<{
    usedCount: number;
    remainingCount: number;
    currentCycle: number;
    totalMessages: number;
  }> {
    const state = await this.getState();
    const totalMessages = MOTIVATIONAL_MESSAGES.length;

    return {
      usedCount: state.usedIndices.length,
      remainingCount: totalMessages - state.usedIndices.length,
      currentCycle: state.currentCycle,
      totalMessages,
    };
  }

  /**
   * Reset the rotation state (useful for testing or manual reset)
   */
  static async resetRotation(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error resetting message rotation:', error);
    }
  }
}
