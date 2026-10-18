import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '@/database/database';
import { HealthScoreService } from './HealthScoreService';
import { UserService } from './UserService';

/** Marks that the initial "don't celebrate history" pass has run. */
const JOURNEY_SEEDED_KEY = '@journeys_seeded';

/**
 * Journeys — lifetime walking distance mapped onto real destinations.
 *
 * The ladder is deliberately tiered. Health Connect only serves 30 days of
 * history, so a fresh install starts with a small total; anchoring straight to
 * the Moon would sit at 0.0001% forever and read as broken. Instead the user is
 * always partway through something reachable, with the absurd ones visible
 * below as aspiration.
 */

export interface Journey {
  id: string;
  emoji: string;
  name: string;
  km: number;
  note: string;
}

/**
 * The destination ladder, sorted strictly by distance — the ordering all the
 * progress logic depends on.
 *
 * Deliberately dense. At a typical 5 km/day there is a new destination roughly
 * every week or two for years, rather than a handful that are all cleared in the
 * first month and then a decade-long gap. Gaps between consecutive entries stay
 * under ~2x for as long as possible so progress never stalls.
 *
 * Ends at Moon and Back (768,800 km). The Sun is deliberately left out: at one
 * astronomical unit it is ~195x further than the Moon round trip, which makes
 * every percentage before it look like zero.
 */
export const JOURNEYS: Journey[] = [
  // --- First week or two -------------------------------------------------
  { id: 'golden-gate', emoji: '🌉', name: 'Golden Gate Bridge', km: 2.7, note: 'end to end' },
  { id: 'central-park', emoji: '🌳', name: 'Central Park Loop', km: 10, note: 'the full circuit' },
  { id: 'manhattan', emoji: '🏙️', name: 'Length of Manhattan', km: 21.6, note: 'Battery Park to Inwood' },
  { id: 'channel', emoji: '🌊', name: 'English Channel', km: 34, note: 'Dover to Calais' },
  { id: 'marathon', emoji: '🏃', name: 'Marathon', km: 42.2, note: 'the classic distance' },
  { id: 'luxembourg', emoji: '🇱🇺', name: 'Length of Luxembourg', km: 82, note: 'end to end' },
  { id: 'grand-canyon', emoji: '🏜️', name: 'Grand Canyon', km: 135, note: 'rim to rim to rim' },
  { id: 'belgium', emoji: '🇧🇪', name: 'Length of Belgium', km: 280, note: 'north to south' },
  { id: 'netherlands', emoji: '🇳🇱', name: 'Length of the Netherlands', km: 300, note: 'Groningen to Maastricht' },

  // --- First few months --------------------------------------------------
  { id: 'srilanka', emoji: '🇱🇰', name: 'Length of Sri Lanka', km: 445, note: 'north to south' },
  { id: 'portugal', emoji: '🇵🇹', name: 'Length of Portugal', km: 560, note: 'Braga to Faro' },
  { id: 'ireland', emoji: '🇮🇪', name: 'Length of Ireland', km: 640, note: 'Malin Head to Mizen Head' },
  { id: 'camino', emoji: '🐚', name: 'Camino de Santiago', km: 780, note: 'the French Way' },
  { id: 'greece', emoji: '🇬🇷', name: 'Length of Greece', km: 900, note: 'north to south' },
  { id: 'uk', emoji: '🇬🇧', name: 'Length of Britain', km: 1407, note: "Land's End to John o' Groats" },
  { id: 'italy', emoji: '🇮🇹', name: 'Length of Italy', km: 1200, note: 'the whole boot' },
  { id: 'delhi-mumbai', emoji: '🇮🇳', name: 'Delhi to Mumbai', km: 1400, note: 'across India' },
  { id: 'paris-rome', emoji: '🇫🇷', name: 'Paris to Rome', km: 1420, note: 'overland' },
  { id: 'norway', emoji: '🇳🇴', name: 'Length of Norway', km: 1750, note: 'Lindesnes to Nordkapp' },
  { id: 'appalachian', emoji: '🥾', name: 'Appalachian Trail', km: 3540, note: 'Georgia to Maine' },
  { id: 'japan', emoji: '🗾', name: 'Length of Japan', km: 3000, note: 'Hokkaido to Kyushu' },

  // --- First couple of years ---------------------------------------------
  { id: 'lisbon-helsinki', emoji: '🇪🇺', name: 'Lisbon to Helsinki', km: 4000, note: 'corner to corner of Europe' },
  { id: 'pacific-crest', emoji: '⛰️', name: 'Pacific Crest Trail', km: 4265, note: 'Mexico to Canada' },
  { id: 'route66', emoji: '🛣️', name: 'Route 66', km: 3940, note: 'Chicago to Santa Monica' },
  { id: 'india', emoji: '🇮🇳', name: 'Length of India', km: 3214, note: 'Kashmir to Kanyakumari' },
  { id: 'great-wall', emoji: '🧱', name: 'Great Wall of China', km: 8850, note: 'the whole thing' },
  { id: 'trans-siberian', emoji: '🚂', name: 'Trans-Siberian Railway', km: 9289, note: 'Moscow to Vladivostok' },
  { id: 'silk-road', emoji: '🐫', name: 'The Silk Road', km: 6437, note: "Xi'an to the Mediterranean" },
  { id: 'nile', emoji: '🐊', name: 'Length of the Nile', km: 6650, note: 'source to sea' },
  { id: 'amazon', emoji: '🌴', name: 'Length of the Amazon', km: 6400, note: 'Andes to Atlantic' },
  { id: 'africa', emoji: '🌍', name: 'Cairo to Cape Town', km: 10000, note: 'the length of Africa' },
  { id: 'panamerican', emoji: '🛤️', name: 'Pan-American Highway', km: 30000, note: 'Alaska to Argentina' },

  // --- The long haul -----------------------------------------------------
  { id: 'mars', emoji: '🔴', name: 'Mars Circumnavigator', km: 21344, note: 'Mars is smaller than Earth' },
  { id: 'earth', emoji: '🌍', name: 'Earth Circumnavigator', km: 40075, note: 'the equator, all the way round' },
  { id: 'earth-x2', emoji: '🌏', name: 'Earth Twice Over', km: 80150, note: 'twice round the equator' },
  { id: 'earth-x5', emoji: '🌎', name: 'Earth Five Times', km: 200375, note: 'five laps of the planet' },
  { id: 'moon', emoji: '🌕', name: 'Moon Walker', km: 384400, note: 'Earth to the Moon' },
  { id: 'moon-return', emoji: '🌍🌕', name: 'Earth to Moon and Back', km: 768800, note: 'there and back again' },
].sort((a, b) => a.km - b.km);

export interface JourneyProgress extends Journey {
  percent: number;
  remainingKm: number;
}

export interface JourneyState {
  /** The shortest journey not yet finished. Auto-advances as distance grows. */
  current: JourneyProgress | null;
  /**
   * The two immediately upcoming destinations, plus the final one — so the
   * ultimate goal stays visible from day one instead of hiding 30 entries down.
   */
  next: JourneyProgress[];
  completed: Journey[];
  totalKm: number;
  daysTracked: number;
  /** False when distance has never been recorded, so the UI can explain why. */
  hasData: boolean;
}

const withProgress = (journey: Journey, totalKm: number): JourneyProgress => ({
  ...journey,
  percent: Math.min(100, (totalKm / journey.km) * 100),
  remainingKm: Math.max(0, journey.km - totalKm),
});

/**
 * The two destinations after the current one, plus the final journey pinned to
 * the end. Keeping the finale permanently in view gives the ladder a horizon;
 * without it the list is just "three slightly bigger numbers".
 *
 * `remaining` excludes the current journey (it is sliced from index 1), and the
 * finale is de-duplicated so it never appears twice near the end of the ladder.
 */
const buildNext = (remaining: Journey[], totalKm: number): JourneyProgress[] => {
  // remaining[0] is the current journey, so anything shown here starts at 1.
  const upcoming = remaining.slice(1, 3);
  const finale = remaining[remaining.length - 1];

  const chosen = [...upcoming];
  // Skip the finale once it becomes the current journey, or it would be listed
  // twice on the same card near the end of the ladder.
  const alreadyShown =
    finale == null ||
    finale.id === remaining[0]?.id ||
    chosen.some((j) => j.id === finale.id);

  if (!alreadyShown) chosen.push(finale);

  return chosen.map((j) => withProgress(j, totalKm));
};

export class JourneyService {
  static async getJourneyProgress(): Promise<JourneyState> {
    const empty: JourneyState = {
      current: null,
      next: [],
      completed: [],
      totalKm: 0,
      daysTracked: 0,
      hasData: false,
    };

    try {
      const totals = await HealthScoreService.getLifetimeTotals();
      const totalKm = totals.distanceKm ?? 0;

      if (!(totalKm > 0)) {
        return { ...empty, daysTracked: totals.daysTracked };
      }

      const completed = JOURNEYS.filter((j) => totalKm >= j.km);
      const remaining = JOURNEYS.filter((j) => totalKm < j.km);

      // Everything is finished only if the user has walked an astronomical unit,
      // which will not happen — but handle it rather than crashing on undefined.
      const current = remaining.length > 0 ? withProgress(remaining[0], totalKm) : null;

      return {
        current,
        next: buildNext(remaining, totalKm),
        completed,
        totalKm,
        daysTracked: totals.daysTracked,
        hasData: true,
      };
    } catch {
      return empty;
    }
  }

  /**
   * Record any journeys the lifetime total has passed.
   *
   * Completions are written to SQLite rather than derived on the fly, so the
   * date each was achieved is preserved and a journey stays earned permanently.
   * Safe to call repeatedly — the UNIQUE(user_id, journey_id) constraint means
   * a journey is only ever recorded once.
   */
  static async recordCompletions(): Promise<void> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return;

      const totals = await HealthScoreService.getLifetimeTotals();
      const totalKm = totals.distanceKm ?? 0;
      if (!(totalKm > 0)) return;

      for (const journey of JOURNEYS) {
        if (totalKm < journey.km) break; // ladder is sorted, so nothing beyond
        await db.runAsync(
          `INSERT INTO journey_completions
             (user_id, journey_id, journey_km, total_km_at_completion, completed_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, journey_id) DO NOTHING`,
          [user.id, journey.id, journey.km, totalKm, new Date().toISOString()]
        );
      }
    } catch (error) {
      console.log('Journey completion recording skipped:', error);
    }
  }

  /**
   * The next completed-but-not-yet-celebrated journey, marked as celebrated so
   * it is returned exactly once.
   */
  static async consumeNewlyCompletedJourney(): Promise<Journey | null> {
    try {
      // On first run, everything already achieved is silently marked as seen —
      // a user adopting this feature with months of walking behind them should
      // not face a queue of celebrations they didn't earn in the moment.
      const seeded = await AsyncStorage.getItem(JOURNEY_SEEDED_KEY).catch(() => null);
      if (seeded == null) {
        await this.markExistingAsCelebrated();
        await AsyncStorage.setItem(JOURNEY_SEEDED_KEY, '1').catch(() => {});
        return null;
      }

      await this.recordCompletions();

      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return null;

      const row = await db.getFirstAsync<{ journey_id: string }>(
        `SELECT journey_id FROM journey_completions
         WHERE user_id = ? AND celebrated = 0
         ORDER BY journey_km DESC
         LIMIT 1`,
        [user.id]
      );
      if (!row) return null;

      await db.runAsync(
        `UPDATE journey_completions SET celebrated = 1
         WHERE user_id = ? AND journey_id = ?`,
        [user.id, row.journey_id]
      );

      return JOURNEYS.find((j) => j.id === row.journey_id) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Mark everything already achieved as celebrated, without announcing it.
   *
   * Called once on first run so a user installing this feature with months of
   * existing distance is not shown a backlog of celebrations they did not earn
   * in the moment.
   */
  static async markExistingAsCelebrated(): Promise<void> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return;
      await this.recordCompletions();
      await db.runAsync(
        'UPDATE journey_completions SET celebrated = 1 WHERE user_id = ?',
        [user.id]
      );
    } catch {
      // Non-critical.
    }
  }

  /** Completed journeys with the date each was reached. */
  static async getCompletionHistory(): Promise<
    { journey: Journey; completedAt: string; totalKmAtCompletion: number }[]
  > {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return [];
      const rows = await db.getAllAsync<{
        journey_id: string;
        completed_at: string;
        total_km_at_completion: number;
      }>(
        `SELECT journey_id, completed_at, total_km_at_completion
         FROM journey_completions
         WHERE user_id = ?
         ORDER BY journey_km ASC`,
        [user.id]
      );
      return rows
        .map((r) => {
          const journey = JOURNEYS.find((j) => j.id === r.journey_id);
          return journey
            ? {
                journey,
                completedAt: r.completed_at,
                totalKmAtCompletion: r.total_km_at_completion,
              }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    } catch {
      return [];
    }
  }

  /** Formats a distance for display, keeping small numbers readable. */
  static formatKm(km: number): string {
    if (km >= 10000) return `${Math.round(km).toLocaleString()} km`;
    if (km >= 100) return `${Math.round(km)} km`;
    if (km >= 10) return `${km.toFixed(1)} km`;
    return `${km.toFixed(2)} km`;
  }
}
