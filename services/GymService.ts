import { database, Gym } from '@/database/database';
import { UserService } from './UserService';

export class GymService {
  static async createGym(data: {
    location_type: 'gym' | 'home';
    latitude: number;
    longitude: number;
    radius: number;
  }): Promise<Gym> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) throw new Error('No user found');

    // Delete existing location of the same type for user
    await db.runAsync('DELETE FROM gyms WHERE user_id = ? AND location_type = ?', [user.id, data.location_type]);

    const result = await db.runAsync(
      'INSERT INTO gyms (user_id, location_type, latitude, longitude, radius) VALUES (?, ?, ?, ?, ?)',
      [user.id, data.location_type, data.latitude, data.longitude, data.radius]
    );

    const gym = await db.getFirstAsync<Gym>(
      'SELECT * FROM gyms WHERE id = ?',
      [result.lastInsertRowId]
    );

    if (!gym) throw new Error('Failed to create gym');
    return gym;
  }

  static async getUserGym(): Promise<Gym | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return null;

    const gym = await db.getFirstAsync<Gym>(
      'SELECT * FROM gyms WHERE user_id = ? AND location_type = ? ORDER BY created_at DESC LIMIT 1',
      [user.id, 'gym']
    );

    return gym;
  }

  static async getUserHomeLocation(): Promise<Gym | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return null;

    const home = await db.getFirstAsync<Gym>(
      'SELECT * FROM gyms WHERE user_id = ? AND location_type = ? ORDER BY created_at DESC LIMIT 1',
      [user.id, 'home']
    );

    return home;
  }

  static async getUserLocations(): Promise<{ gym: Gym | null; home: Gym | null }> {
    const gym = await this.getUserGym();
    const home = await this.getUserHomeLocation();
    return { gym, home };
  }
}
