import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Navigation, Search } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PlaceMap, type PlaceMapHandle } from '@/components/places/PlaceMap';
import { LocationService } from '@/services/LocationService';
import {
  DEFAULT_RADIUS,
  PLACE_TYPES,
  PlaceService,
  RADIUS_OPTIONS,
  placeTypeInfo,
} from '@/services/PlaceService';
import type { PlaceType } from '@/database/database';
import { colors, fonts } from '@/constants/theme';

type Point = { latitude: number; longitude: number };
type SearchHit = { name: string; detail: string; latitude: number; longitude: number };

// Shown when there's no saved point and no GPS fix: the whole world, so the
// user searches or zooms in.
const WORLD = { latitude: 20, longitude: 0, zoom: 2 };

/**
 * Add or edit one place. Drag the map under the pin (or search, or use where
 * you're standing), name it, pick Gym, Home or Sport, and set the radius.
 */
export default function PlaceScreen() {
  const insets = useSafeAreaInsets();
  const { id, type: typeParam } = useLocalSearchParams<{ id?: string; type?: PlaceType }>();
  const editingId = id ? Number(id) : null;
  const map = useRef<PlaceMapHandle>(null);

  const [start, setStart] = useState<(Point & { zoom: number }) | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<PlaceType>(typeParam ?? 'gym');
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    (async () => {
      if (editingId) {
        const place = await PlaceService.get(editingId);
        if (place) {
          setName(place.name ?? '');
          setType(place.location_type);
          setRadius(place.radius || DEFAULT_RADIUS);
          setPoint({ latitude: place.latitude, longitude: place.longitude });
          setStart({ latitude: place.latitude, longitude: place.longitude, zoom: 16 });
          return;
        }
      }
      // A new place starts where you are, if the phone will say.
      try {
        const { latitude, longitude } = (await LocationService.getCurrentLocation()).coords;
        setPoint({ latitude, longitude });
        setStart({ latitude, longitude, zoom: 16 });
      } catch {
        setStart(WORLD);
      }
    })();
  }, [editingId]);

  const locateMe = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocating(true);
    try {
      const { latitude, longitude } = (await LocationService.getCurrentLocation()).coords;
      setPoint({ latitude, longitude });
      map.current?.moveTo(latitude, longitude, 16);
    } catch (error) {
      Alert.alert('Location Error', LocationService.getErrorMessage(error));
    } finally {
      setLocating(false);
    }
  };

  // OpenStreetMap's search. Run on submit only, as its usage policy asks.
  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setHits([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': 'NoWomp/2.0 (https://github.com/akashkashyaps/nowomp)' } }
      );
      const rows: { display_name: string; lat: string; lon: string }[] = await res.json();
      const found = rows.map((r) => {
        const [first, ...rest] = r.display_name.split(', ');
        return { name: first, detail: rest.slice(0, 3).join(', '), latitude: +r.lat, longitude: +r.lon };
      });
      setHits(found);
      if (found.length === 0) Alert.alert('Nothing found', 'Try a different name, or drag the map to it.');
    } catch {
      Alert.alert('Search needs internet', 'Drag the map to your place, or stand there and tap USE WHERE I AM.');
    } finally {
      setSearching(false);
    }
  };

  const pickHit = (hit: SearchHit) => {
    setHits([]);
    setQuery('');
    setPoint({ latitude: hit.latitude, longitude: hit.longitude });
    if (!name.trim()) setName(hit.name);
    map.current?.moveTo(hit.latitude, hit.longitude, 16);
  };

  // Back to wherever the editor was opened from (Places or onboarding).
  const done = () => (router.canGoBack() ? router.back() : router.replace('/settings/places'));

  const save = async () => {
    if (!point) {
      Alert.alert('Pick a spot', 'Drag the map so the pin sits on your place, or tap USE WHERE I AM.');
      return;
    }
    setSaving(true);
    try {
      const input = { name, location_type: type, radius, ...point };
      if (editingId) await PlaceService.update(editingId, input);
      else await PlaceService.add(input);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      done();
    } catch (error) {
      Alert.alert('Could not save', (error as Error).message);
      setSaving(false);
    }
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert('Delete this place?', 'Past sessions stay. You just can’t start new ones here.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await PlaceService.remove(editingId);
          done();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={editingId ? 'EDIT PLACE' : 'ADD A PLACE'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              returnKeyType="search"
              placeholder="Search a gym, park, club…"
              placeholderTextColor={colors.textFaint}
            />
            <TouchableOpacity style={styles.searchButton} onPress={search} disabled={searching}>
              {searching ? <ActivityIndicator color={colors.bg} /> : <Search size={18} color={colors.bg} strokeWidth={2.5} />}
            </TouchableOpacity>
          </View>

          {hits.length > 0 && (
            <View style={styles.hits}>
              {hits.map((hit, i) => (
                <TouchableOpacity key={i} style={[styles.hit, i > 0 && styles.hitDivider]} onPress={() => pickHit(hit)}>
                  <Text style={styles.hitName} numberOfLines={1}>{hit.name}</Text>
                  {hit.detail ? <Text style={styles.hitDetail} numberOfLines={1}>{hit.detail}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {start ? (
            <PlaceMap
              ref={map}
              latitude={start.latitude}
              longitude={start.longitude}
              zoom={start.zoom}
              radius={radius}
              onMove={(latitude, longitude) => setPoint({ latitude, longitude })}
            />
          ) : (
            <View style={styles.mapLoading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.hint}>Finding you…</Text>
            </View>
          )}
          <Text style={styles.hint}>Drag the map so the pin sits on the place.</Text>

          <TouchableOpacity style={styles.hereButton} onPress={locateMe} disabled={locating}>
            {locating ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                <Navigation size={16} color={colors.accent} strokeWidth={2.5} />
                <Text style={styles.hereText}>USE WHERE I AM</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>WHAT IS IT?</Text>
          <View style={styles.chips}>
            {PLACE_TYPES.map((t) => (
              <TouchableOpacity
                key={t.type}
                style={[styles.chip, type === t.type && styles.chipOn]}
                onPress={() => setType(t.type)}
              >
                <Text style={styles.chipEmoji}>{t.emoji}</Text>
                <Text style={[styles.chipText, type === t.type && styles.chipTextOn]}>{t.label.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.note}>
            {type === 'sport'
              ? 'Sport keeps your streak alive, and is counted apart from workouts.'
              : 'Gym and home sessions both count as workouts.'}
          </Text>

          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={placeTypeInfo(type).example}
            placeholderTextColor={colors.textFaint}
            maxLength={30}
          />

          <Text style={styles.label}>HOW CLOSE YOU MUST BE</Text>
          <View style={styles.chips}>
            {RADIUS_OPTIONS.map((r) => (
              <TouchableOpacity key={r} style={[styles.chip, radius === r && styles.chipOn]} onPress={() => setRadius(r)}>
                <Text style={[styles.chipText, radius === r && styles.chipTextOn]}>{r} M</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.note}>Bigger helps with big parks and weak GPS indoors.</Text>

          <TouchableOpacity style={[styles.save, (saving || !point) && styles.disabled]} onPress={save} disabled={saving}>
            <Text style={styles.saveText}>{saving ? 'SAVING…' : 'SAVE PLACE'}</Text>
          </TouchableOpacity>

          {editingId ? (
            <TouchableOpacity style={styles.delete} onPress={remove}>
              <Text style={styles.deleteText}>DELETE PLACE</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 10 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.text,
  },
  searchButton: {
    width: 50,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hits: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  hit: { paddingHorizontal: 14, paddingVertical: 10 },
  hitDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  hitName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  hitDetail: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 2 },
  mapLoading: {
    height: 300,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, textAlign: 'center' },
  hereButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    minHeight: 48,
  },
  hereText: { fontFamily: fonts.heading, fontSize: 14, color: colors.accent },
  label: { fontFamily: fonts.heading, fontSize: 14, color: colors.textMuted, marginTop: 14 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: '#1F2A12' },
  chipEmoji: { fontSize: 16 },
  chipText: { fontFamily: fonts.heading, fontSize: 13, color: colors.textMuted },
  chipTextOn: { color: colors.accent },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, lineHeight: 17 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.text,
  },
  save: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  saveText: { fontFamily: fonts.heading, fontSize: 16, color: colors.bg },
  disabled: { opacity: 0.5 },
  delete: { alignItems: 'center', paddingVertical: 14 },
  deleteText: { fontFamily: fonts.heading, fontSize: 13, color: colors.danger },
});
