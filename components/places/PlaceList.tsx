import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronRight, Plus } from 'lucide-react-native';
import { MAX_PLACES, PlaceService, placeName, placeTypeInfo, type Place } from '@/services/PlaceService';
import { colors, fonts } from '@/constants/theme';

/**
 * The saved places as tappable rows, plus an add button. Reloads whenever
 * the screen comes back into focus (after adding or editing one).
 */
export function PlaceList({ onChange }: { onChange?: (places: Place[]) => void }) {
  const [places, setPlaces] = useState<Place[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      PlaceService.list()
        .then((list) => {
          setPlaces(list);
          onChange?.(list);
        })
        .catch(() => setPlaces([]));
    }, [onChange])
  );

  const open = (id?: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(id ? { pathname: '/settings/place', params: { id: String(id) } } : '/settings/place');
  };

  if (!places) return null;

  return (
    <View style={styles.wrap}>
      {places.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>NO PLACES YET</Text>
          <Text style={styles.emptyText}>
            Add where you train: your gym, home, or where you play sport. Sessions only count when
            you start them there.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          {places.map((p, i) => {
            const info = placeTypeInfo(p.location_type);
            return (
              <TouchableOpacity key={p.id} style={[styles.row, i > 0 && styles.divider]} onPress={() => open(p.id)}>
                <Text style={styles.emoji}>{info.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{placeName(p)}</Text>
                  <Text style={styles.meta}>
                    {info.label.toUpperCase()} · {p.radius || 200} M
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textFaint} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {places.length < MAX_PLACES && (
        <TouchableOpacity style={styles.add} onPress={() => open()}>
          <Plus size={18} color={colors.accent} strokeWidth={3} />
          <Text style={styles.addText}>ADD A PLACE</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  emoji: { fontSize: 24 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  meta: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.textDim, marginTop: 2, letterSpacing: 0.5 },
  empty: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 6,
  },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 14,
  },
  addText: { fontFamily: fonts.heading, fontSize: 15, color: colors.accent },
});
