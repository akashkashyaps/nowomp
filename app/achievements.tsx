import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PixelBadge } from '@/components/PixelBadge';
import { AchievementService, type AchievementState } from '@/services/AchievementService';
import { GROUP_LABELS, type AchievementGroup } from '@/constants/achievements';
import { colors, fonts } from '@/constants/theme';

const GROUP_ORDER: AchievementGroup[] = [
  'consistency',
  'accountability',
  'lab',
  'health',
  'journeys',
  'shame',
];

export default function AchievementsScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<AchievementState[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await AchievementService.evaluate();
        setItems(await AchievementService.getAll());
        // Clear the NEW badges after they have been rendered once.
        await AchievementService.markAllSeen();
      } catch (error) {
        console.error('Error loading achievements:', error);
        setItems([]);
      }
    })();
  }, []);

  const unlocked = items?.filter((i) => i.unlockedAt).length ?? 0;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="TROPHIES"
        subtitle={items ? `${unlocked} OF ${items.length} UNLOCKED` : undefined}
      />

      {!items ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {GROUP_ORDER.map((group) => {
            const groupItems = items.filter((i) => i.def.group === group);
            if (groupItems.length === 0) return null;
            const groupUnlocked = groupItems.filter((i) => i.unlockedAt).length;
            return (
              <View key={group} style={styles.group}>
                <View style={styles.groupHeader}>
                  <Text style={[styles.groupTitle, group === 'shame' && { color: colors.danger }]}>
                    {GROUP_LABELS[group]}
                  </Text>
                  <Text style={styles.groupCount}>
                    {groupUnlocked}/{groupItems.length}
                  </Text>
                </View>
                {group === 'shame' && (
                  <Text style={styles.groupNote}>
                    Earned by making excuses. Hidden until you earn them.
                  </Text>
                )}
                {groupItems.map((item) => (
                  <AchievementRow key={item.def.id} item={item} />
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function AchievementRow({ item }: { item: AchievementState }) {
  const { def, unlockedAt, seen, value } = item;
  const isUnlocked = unlockedAt != null;
  const isSecret = def.hidden && !isUnlocked;
  const isShame = def.group === 'shame';
  const progress = def.target > 0 ? value / def.target : 0;

  return (
    <View style={[styles.row, isUnlocked && (isShame ? styles.rowShame : styles.rowUnlocked)]}>
      <PixelBadge id={def.id} state={isUnlocked ? 'unlocked' : isSecret ? 'secret' : 'locked'} size={60} />
      <View style={styles.rowText}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle, !isUnlocked && styles.rowTitleLocked]} numberOfLines={1}>
            {isSecret ? '???' : def.title}
          </Text>
          {isUnlocked && !seen && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowDesc}>
          {isSecret ? 'Hidden. Keep making excuses to find out.' : def.description}
        </Text>
        {isUnlocked ? (
          <Text style={styles.rowDate}>
            Unlocked{' '}
            {new Date(unlockedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        ) : (
          !isSecret &&
          def.target > 1 && (
            <View style={styles.progressLine}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(1, progress) * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {value}/{def.target}
              </Text>
            </View>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  group: {
    marginBottom: 24,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
    marginHorizontal: 4,
  },
  groupTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.accent,
  },
  groupCount: {
    fontFamily: fonts.numeric,
    fontSize: 13,
    color: colors.textDim,
  },
  groupNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textDim,
    marginHorizontal: 4,
    marginTop: -4,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowUnlocked: {
    borderColor: colors.accent,
  },
  rowShame: {
    borderColor: colors.danger,
  },
  rowText: {
    flex: 1,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.text,
    flexShrink: 1,
  },
  rowTitleLocked: {
    color: colors.textMuted,
  },
  rowDesc: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  rowDate: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textDim,
    marginTop: 6,
  },
  newBadge: {
    backgroundColor: colors.danger,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  newBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.text,
  },
  progressLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  progressText: {
    fontFamily: fonts.numeric,
    fontSize: 11,
    color: colors.textDim,
    minWidth: 40,
    textAlign: 'right',
  },
});
