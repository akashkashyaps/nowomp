import { database, Gym, PlaceType } from '@/database/database';
import { UserService } from './UserService';

export type Place = Gym;

export const MAX_PLACES = 10;
export const DEFAULT_RADIUS = 200;
export const RADIUS_OPTIONS = [100, 200, 300] as const;

export const PLACE_TYPES: { type: PlaceType; label: string; emoji: string; example: string }[] = [
  { type: 'gym', label: 'Gym', emoji: '🏋️', example: 'e.g. PureGym Leeds' },
  { type: 'home', label: 'Home', emoji: '🏠', example: 'e.g. Home' },
  { type: 'sport', label: 'Sport', emoji: '⚽', example: 'e.g. Football pitch' },
];

export const placeTypeInfo = (type: PlaceType | null | undefined) =>
  PLACE_TYPES.find((t) => t.type === type) ?? PLACE_TYPES[0];

/** The label shown for a place. Rows saved before places had names fall back to their type. */
export const placeName = (place: Pick<Place, 'name' | 'location_type'>) =>
  place.name?.trim() || placeTypeInfo(place.location_type).label;

/** Sport is counted apart from workouts; gym and home sessions are both workouts. */
export const isSport = (activity: PlaceType | null | undefined) => activity === 'sport';

export interface PlaceInput {
  name: string;
  location_type: PlaceType;
  latitude: number;
  longitude: number;
  radius: number;
}

/**
 * The places a session can be started at: any number of gyms, homes and
 * sport venues, each with its own name and radius.
 */
export class PlaceService {
  static async list(): Promise<Place[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return [];
    return db.getAllAsync<Place>(
      `SELECT * FROM gyms WHERE user_id = ?
       ORDER BY CASE location_type WHEN 'gym' THEN 0 WHEN 'home' THEN 1 ELSE 2 END, created_at`,
      [user.id]
    );
  }

  static async get(id: number): Promise<Place | null> {
    const db = await database.getDatabase();
    return db.getFirstAsync<Place>('SELECT * FROM gyms WHERE id = ?', [id]);
  }

  static async count(): Promise<number> {
    return (await this.list()).length;
  }

  static async add(input: PlaceInput): Promise<Place> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');
    if ((await this.count()) >= MAX_PLACES) {
      throw new Error(`You can save up to ${MAX_PLACES} places. Delete one first.`);
    }
    const result = await db.runAsync(
      'INSERT INTO gyms (user_id, location_type, name, latitude, longitude, radius) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, input.location_type, input.name.trim() || null, input.latitude, input.longitude, input.radius]
    );
    const place = await this.get(result.lastInsertRowId);
    if (!place) throw new Error('Failed to save place');
    return place;
  }

  static async update(id: number, input: PlaceInput): Promise<void> {
    const db = await database.getDatabase();
    await db.runAsync(
      'UPDATE gyms SET location_type = ?, name = ?, latitude = ?, longitude = ?, radius = ? WHERE id = ?',
      [input.location_type, input.name.trim() || null, input.latitude, input.longitude, input.radius, id]
    );
  }

  static async remove(id: number): Promise<void> {
    const db = await database.getDatabase();
    await db.runAsync('DELETE FROM gyms WHERE id = ?', [id]);
  }

  /** Metres between two coordinates (haversine). */
  static distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** The closest saved place whose radius contains the point, or null. */
  static match(places: Place[], latitude: number, longitude: number): Place | null {
    let best: { place: Place; d: number } | null = null;
    for (const place of places) {
      const d = this.distance(latitude, longitude, place.latitude, place.longitude);
      if (d <= (place.radius || DEFAULT_RADIUS) && (!best || d < best.d)) best = { place, d };
    }
    return best?.place ?? null;
  }
}
