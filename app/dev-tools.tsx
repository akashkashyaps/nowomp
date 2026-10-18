import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, RefreshCw } from 'lucide-react-native';
import { database } from '@/database/database';
import { UserService } from '@/services/UserService';
import { WorkoutService } from '@/services/WorkoutService';
import { FreezeTokenService } from '@/services/FreezeTokenService';
import { DailyMaintenanceService } from '@/services/DailyMaintenanceService';
import { getTodayLocal } from '@/utils/dateUtils';

import { colors, fonts } from '@/constants/theme';
interface AppState {
  streak: number;
  freezeTokens: number;
  totalEarned: number;
  totalUsed: number;
  totalExpired: number;
  activeRedemption: any | null;
  recentRedemptions: any[];
  scheduledWorkouts: any[];
  recentWorkouts: any[];
  pendingExcuse: string | null;
}

/**
 * Debug-only screen. It writes directly to the database — streaks, dates,
 * freeze tokens — so it must never be reachable in a release build, including
 * via a deep link that bypasses the tap gesture in Settings.
 */
export default function DevToolsScreen() {
  if (!__DEV__) {
    return <DevToolsUnavailable />;
  }
  return <DevToolsContent />;
}

function DevToolsUnavailable() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <ArrowLeft size={22} color={colors.text} strokeWidth={2.5} />
      </TouchableOpacity>
      <Text style={styles.title}>NOT AVAILABLE</Text>
    </View>
  );
}

function DevToolsContent() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [streakInput, setStreakInput] = useState('');
  const [tokenInput, setTokenInput] = useState('1');

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) { setState(null); return; }

      const [streak, tokenStats, activeRedemption, recentRedemptions, scheduledWorkouts, recentWorkouts, pendingExcuse] = await Promise.all([
        WorkoutService.getCurrentStreak(),
        FreezeTokenService.getTokenStats(),
        db.getFirstAsync<any>(
          `SELECT * FROM redemption_workouts WHERE user_id = ? AND status = 'active' ORDER BY triggered_at DESC LIMIT 1`,
          [user.id]
        ),
        db.getAllAsync<any>(
          `SELECT id, status, triggered_by_missed_date, deadline, redemption_type FROM redemption_workouts WHERE user_id = ? ORDER BY triggered_at DESC LIMIT 5`,
          [user.id]
        ),
        db.getAllAsync<any>(
          `SELECT workout_date, workout_time FROM scheduled_workouts WHERE user_id = ? ORDER BY workout_date ASC LIMIT 7`,
          [user.id]
        ),
        db.getAllAsync<any>(
          `SELECT workout_date, status, verified FROM workouts WHERE user_id = ? ORDER BY workout_date DESC LIMIT 7`,
          [user.id]
        ),
        DailyMaintenanceService.getPendingExcuseDate(),
      ]);

      setState({
        streak,
        freezeTokens: tokenStats.availableTokens,
        totalEarned: tokenStats.totalEarned,
        totalUsed: tokenStats.totalUsed,
        totalExpired: tokenStats.totalExpired,
        activeRedemption,
        recentRedemptions,
        scheduledWorkouts,
        recentWorkouts,
        pendingExcuse,
      });
    } catch (e: any) {
      Alert.alert('Load Error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadState(); }, [loadState]));

  const run = async (key: string, fn: () => Promise<void>) => {
    setActionLoading(key);
    try {
      await fn();
      await loadState();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceFailRedemption = () => run('failRedemption', async () => {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const active = await db.getFirstAsync<any>(
      `SELECT * FROM redemption_workouts WHERE user_id = ? AND status = 'active' LIMIT 1`,
      [user.id]
    );

    if (active) {
      const pastDeadline = new Date(Date.now() - 1000).toISOString();
      await db.runAsync(
        `UPDATE redemption_workouts SET status = 'failed', deadline = ? WHERE id = ?`,
        [pastDeadline, active.id]
      );
      // Run maintenance so streak recalculates
      await DailyMaintenanceService.checkAndRunMaintenance();
      Alert.alert('Done', `Redemption #${active.id} force-failed. Streak reset.`);
    } else {
      // Create a fake failed redemption for yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const pastDeadline = new Date(Date.now() - 1000).toISOString();
      await db.runAsync(
        `INSERT INTO redemption_workouts (user_id, triggered_by_missed_date, triggered_at, starts_at, deadline, status, redemption_type)
         VALUES (?, ?, ?, ?, ?, 'failed', 'unscheduled')`,
        [user.id, yesterdayStr, pastDeadline, pastDeadline, pastDeadline]
      );
      Alert.alert('Done', `No active redemption found. Created fake failed redemption for ${yesterdayStr}.`);
    }
  });

  const handleForceStartRedemption = () => run('startRedemption', async () => {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const existing = await db.getFirstAsync<any>(
      `SELECT * FROM redemption_workouts WHERE user_id = ? AND status = 'active' LIMIT 1`,
      [user.id]
    );
    if (existing) throw new Error('Active redemption already exists (ID ' + existing.id + ')');

    const today = getTodayLocal();
    const now = new Date().toISOString();
    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await db.runAsync(
      `INSERT INTO redemption_workouts (user_id, triggered_by_missed_date, triggered_at, starts_at, deadline, status, redemption_type)
       VALUES (?, ?, ?, ?, ?, 'active', 'unscheduled')`,
      [user.id, today, now, now, deadline]
    );
    Alert.alert('Done', 'Redemption mode started. Deadline: 48h from now.');
  });

  const handleAddFreezeTokens = () => run('addTokens', async () => {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const count = parseInt(tokenInput) || 1;
    if (count < 1 || count > 10) throw new Error('Enter a number between 1 and 10');

    const now = new Date();
    const expiryDate = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < count; i++) {
      await db.runAsync(
        `INSERT INTO freeze_tokens (user_id, earned_at, earned_on_streak_day, expires_at) VALUES (?, ?, ?, ?)`,
        [user.id, now.toISOString(), 0, expiryDate.toISOString()]
      );
    }
    Alert.alert('Done', `Added ${count} freeze token(s).`);
  });

  const handleConsumeToken = () => run('consumeToken', async () => {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const now = new Date().toISOString();
    const token = await db.getFirstAsync<any>(
      `SELECT * FROM freeze_tokens WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY earned_at ASC LIMIT 1`,
      [user.id, now]
    );
    if (!token) throw new Error('No available freeze tokens to consume');

    await db.runAsync(
      `UPDATE freeze_tokens SET used_at = ? WHERE id = ?`,
      [now, token.id]
    );
    Alert.alert('Done', `Token #${token.id} consumed (simulated use).`);
  });

  const handleSetStreak = () => run('setStreak', async () => {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const target = parseInt(streakInput);
    if (isNaN(target) || target < 0) throw new Error('Enter a valid non-negative number');

    // Delete all workouts and insert exactly `target` completed verified workouts
    // on consecutive past dates so getCurrentStreak() returns the right value
    await db.runAsync(`DELETE FROM workouts WHERE user_id = ?`, [user.id]);
    await db.runAsync(`DELETE FROM scheduled_workouts WHERE user_id = ?`, [user.id]);
    await db.runAsync(`DELETE FROM redemption_workouts WHERE user_id = ?`, [user.id]);
    await db.runAsync(`DELETE FROM skips WHERE user_id = ?`, [user.id]);
    await db.runAsync(`DELETE FROM excuse_submissions WHERE user_id = ?`, [user.id]);

    for (let i = target - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - (target - 1 - i) - 1); // yesterday and before
      const dateStr = d.toISOString().split('T')[0];
      const nowStr = d.toISOString();
      await db.runAsync(
        `INSERT INTO workouts (user_id, verified, workout_date, status, started_at, ended_at) VALUES (?, 1, ?, 'completed', ?, ?)`,
        [user.id, dateStr, nowStr, nowStr]
      );
    }

    Alert.alert('Done', `Streak set to ${target}. All past workouts/redemptions cleared and rebuilt.`);
  });

  const handleClearAllRedemptions = () => run('clearRedemptions', async () => {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    await db.runAsync(`DELETE FROM redemption_workouts WHERE user_id = ?`, [user.id]);
    Alert.alert('Done', 'All redemption records cleared.');
  });

  const handleRunMaintenance = () => run('maintenance', async () => {
    await DailyMaintenanceService.checkAndRunMaintenance();
    Alert.alert('Done', 'Maintenance run (processFailedRedemptions + cleanupExpiredTokens).');
  });

  const handleForceExpireRedemption = () => run('expireRedemption', async () => {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const active = await db.getFirstAsync<any>(
      `SELECT * FROM redemption_workouts WHERE user_id = ? AND status = 'active' LIMIT 1`,
      [user.id]
    );
    if (!active) throw new Error('No active redemption found');

    // Set deadline to 1 second ago (expired but not yet marked failed)
    const pastDeadline = new Date(Date.now() - 1000).toISOString();
    await db.runAsync(
      `UPDATE redemption_workouts SET deadline = ? WHERE id = ?`,
      [pastDeadline, active.id]
    );
    Alert.alert('Done', `Redemption #${active.id} deadline set to past. Run maintenance to process it.`);
  });

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  const isActive = (key: string) => actionLoading === key;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={20} color={colors.danger} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>DEV TOOLS</Text>
        <TouchableOpacity onPress={loadState} style={styles.refreshButton} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.danger} size="small" /> : <RefreshCw size={18} color={colors.danger} strokeWidth={2.5} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* LIVE STATE */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>LIVE STATE</Text>
          {state ? (
            <>
              <Row label="Streak" value={String(state.streak)} highlight />
              <Row label="Freeze Tokens (available)" value={String(state.freezeTokens)} highlight />
              <Row label="Tokens earned / used / expired" value={`${state.totalEarned} / ${state.totalUsed} / ${state.totalExpired}`} />
              <Row label="Pending excuse date" value={state.pendingExcuse ?? 'none'} />
              <Row
                label="Active redemption"
                value={state.activeRedemption
                  ? `#${state.activeRedemption.id} | deadline: ${fmt(state.activeRedemption.deadline)}`
                  : 'none'}
              />
            </>
          ) : (
            <Text style={styles.dimText}>{loading ? 'Loading…' : 'No data'}</Text>
          )}
        </View>

        {/* RECENT REDEMPTIONS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>RECENT REDEMPTIONS</Text>
          {state?.recentRedemptions.length ? state.recentRedemptions.map(r => (
            <View key={r.id} style={styles.listRow}>
              <Text style={styles.listText}>
                #{r.id} <Text style={r.status === 'failed' ? styles.red : r.status === 'completed' ? styles.green : styles.yellow}>{r.status.toUpperCase()}</Text>
                {' '}| missed: {r.triggered_by_missed_date}
              </Text>
              <Text style={styles.dimText}>deadline: {fmt(r.deadline)}</Text>
            </View>
          )) : <Text style={styles.dimText}>none</Text>}
        </View>

        {/* SCHEDULED WORKOUTS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>SCHEDULED WORKOUTS (next 7)</Text>
          {state?.scheduledWorkouts.length ? state.scheduledWorkouts.map((w, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listText}>{w.workout_date} @ {w.workout_time}</Text>
            </View>
          )) : <Text style={styles.dimText}>none</Text>}
        </View>

        {/* RECENT WORKOUTS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>RECENT WORKOUTS</Text>
          {state?.recentWorkouts.length ? state.recentWorkouts.map((w, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listText}>
                {w.workout_date} — <Text style={w.status === 'completed' ? styles.green : styles.yellow}>{w.status}</Text>
                {w.verified ? ' ✓' : ' (unverified)'}
              </Text>
            </View>
          )) : <Text style={styles.dimText}>none</Text>}
        </View>

        {/* REDEMPTION CONTROLS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>REDEMPTION CONTROLS</Text>
          <Btn label="Force-Start Redemption (48h)" onPress={handleForceStartRedemption} loading={isActive('startRedemption')} />
          <Btn label="Expire Active Redemption (set deadline past)" onPress={handleForceExpireRedemption} loading={isActive('expireRedemption')} />
          <Btn label="Force-Fail Active Redemption + Reset Streak" onPress={handleForceFailRedemption} loading={isActive('failRedemption')} danger />
          <Btn label="Clear All Redemption Records" onPress={handleClearAllRedemptions} loading={isActive('clearRedemptions')} danger />
        </View>

        {/* FREEZE TOKEN CONTROLS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>FREEZE TOKEN CONTROLS</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={tokenInput}
              onChangeText={setTokenInput}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="1"
              placeholderTextColor="#555"
            />
            <TouchableOpacity
              style={[styles.inlineBtn, isActive('addTokens') && styles.btnDisabled]}
              onPress={handleAddFreezeTokens}
              disabled={!!actionLoading}
            >
              {isActive('addTokens') ? <ActivityIndicator color={colors.bg} size="small" /> : <Text style={styles.inlineBtnText}>ADD TOKENS</Text>}
            </TouchableOpacity>
          </View>
          <Btn label="Consume 1 Token (simulated use)" onPress={handleConsumeToken} loading={isActive('consumeToken')} />
        </View>

        {/* STREAK OVERRIDE */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>STREAK OVERRIDE</Text>
          <Text style={styles.warningText}>⚠ Clears ALL workouts, redemptions, excuses, skips. Rebuilds from scratch.</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={streakInput}
              onChangeText={setStreakInput}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="e.g. 30"
              placeholderTextColor="#555"
            />
            <TouchableOpacity
              style={[styles.inlineBtnDanger, isActive('setStreak') && styles.btnDisabled]}
              onPress={handleSetStreak}
              disabled={!!actionLoading}
            >
              {isActive('setStreak') ? <ActivityIndicator color={colors.text} size="small" /> : <Text style={styles.inlineBtnDangerText}>SET STREAK</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* MAINTENANCE */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>MAINTENANCE</Text>
          <Btn label="Run Maintenance Now" onPress={handleRunMaintenance} loading={isActive('maintenance')} />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.stateRow}>
      <Text style={styles.stateLabel}>{label}</Text>
      <Text style={[styles.stateValue, highlight && styles.stateValueHighlight]}>{value}</Text>
    </View>
  );
}

function Btn({ label, onPress, loading, danger }: { label: string; onPress: () => void; loading: boolean; danger?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.btn, danger && styles.btnDanger, loading && styles.btnDisabled]}
      onPress={onPress}
      disabled={loading}
    >
      {loading
        ? <ActivityIndicator color={danger ? colors.danger : colors.accent} size="small" />
        : <Text style={[styles.btnText, danger && styles.btnTextDanger]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A0A0A',
  },
  backButton: { padding: 4 },
  title: {
    flex: 1,
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.danger,
    textAlign: 'center',
  },
  refreshButton: { padding: 4 },
  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  card: {
    backgroundColor: '#130505',
    borderWidth: 1,
    borderColor: '#2A0A0A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 13,
    color: colors.danger,
    letterSpacing: 1,
    marginBottom: 4,
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stateLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim },
  stateValue: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  stateValueHighlight: { color: colors.accent, fontSize: 16 },
  listRow: { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#1A0A0A' },
  listText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text },
  dimText: { fontFamily: fonts.body, fontSize: 12, color: '#555' },
  red: { color: colors.danger },
  green: { color: colors.accent },
  yellow: { color: '#FFB800' },
  warningText: { fontFamily: fonts.body, fontSize: 11, color: '#FF8800', lineHeight: 16 },
  btn: {
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnDanger: { borderColor: colors.danger },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.accent },
  btnTextDanger: { color: colors.danger },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    color: colors.text,
  },
  inlineBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  inlineBtnText: { fontFamily: fonts.heading, fontSize: 12, color: colors.bg },
  inlineBtnDanger: {
    backgroundColor: '#2A0A0A',
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  inlineBtnDangerText: { fontFamily: fonts.heading, fontSize: 12, color: colors.danger },
});
