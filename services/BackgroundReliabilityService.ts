import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Some Android makers kill apps in the background far more aggressively than
 * stock Android. On those phones NoWomp's reminders, the workout timer
 * notification and the home-screen widget's refreshes stop working until the
 * user exempts the app. Android gives apps no way to do this themselves, so
 * the best we can do is explain it once and open the right settings pages.
 */

const DISMISSED_KEY = '@background_reliability_done';

/** Manufacturer (lower-case) → the setting names that maker uses. */
const AGGRESSIVE: Record<string, { name: string; steps: string[] }> = {
  xiaomi: { name: 'Xiaomi', steps: ['Autostart: on', 'Battery saver: No restrictions'] },
  redmi: { name: 'Redmi', steps: ['Autostart: on', 'Battery saver: No restrictions'] },
  poco: { name: 'POCO', steps: ['Autostart: on', 'Battery saver: No restrictions'] },
  oppo: { name: 'OPPO', steps: ['Allow auto-launch', 'Battery: allow background activity'] },
  realme: { name: 'realme', steps: ['Allow auto-launch', 'Battery: allow background activity'] },
  vivo: { name: 'vivo', steps: ['Allow auto-start', 'Battery: high background power use'] },
  oneplus: { name: 'OnePlus', steps: ['Battery: Don’t optimise', 'Allow background activity'] },
  huawei: { name: 'Huawei', steps: ['App launch: manage manually, all on'] },
  honor: { name: 'Honor', steps: ['App launch: manage manually, all on'] },
  samsung: { name: 'Samsung', steps: ['Battery: Unrestricted'] },
};

const manufacturer = (): string => {
  if (Platform.OS !== 'android') return '';
  const c = Platform.constants as { Manufacturer?: string; Brand?: string };
  return (c.Manufacturer || c.Brand || '').toLowerCase();
};

export class BackgroundReliabilityService {
  /** The maker's advice, when this phone is one that kills background apps. */
  static advice(): { name: string; steps: string[] } | null {
    const m = manufacturer();
    return AGGRESSIVE[m] ?? null;
  }

  static async shouldPrompt(): Promise<boolean> {
    if (!this.advice()) return false;
    try {
      return (await AsyncStorage.getItem(DISMISSED_KEY)) == null;
    } catch {
      return false;
    }
  }

  static async markDone(): Promise<void> {
    try {
      await AsyncStorage.setItem(DISMISSED_KEY, '1');
    } catch {}
  }

  /** App info page: where Autostart / auto-launch and per-app battery live on most skins. */
  static openAppSettings(): Promise<void> {
    return Linking.openSettings();
  }

  /** The system list of apps exempt from battery optimisation. */
  static async openBatterySettings(): Promise<void> {
    try {
      await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    } catch {
      await Linking.openSettings();
    }
  }
}
