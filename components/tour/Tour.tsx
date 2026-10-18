import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/constants/theme';

/**
 * Guided tour: a small tip card steps through the screen while the element it
 * talks about outlines itself with a pulsing ring.
 *
 * Deliberately no screen measuring and no full-screen overlay. An earlier
 * spotlight version measured element positions, and when a measurement came
 * back empty it skipped steps until the tour vanished — while its retry loop
 * made the app stutter. Here each <TourTarget> highlights itself, so the ring
 * is always in the right place, and steps whose element isn't mounted are
 * skipped instantly from a registry, without timers.
 */

export interface TourStep {
  target: string;
  title: string;
  body: string;
  /** Where the tip card sits; pick the side that doesn't cover the target. */
  placement?: 'top' | 'bottom';
}

export interface TourOptions {
  /** Shown on the last step next to "Done". */
  finalAction?: { label: string; onPress: () => void };
}

interface TourContextValue {
  register: (id: string) => () => void;
  start: (name: string, steps: TourStep[], options?: TourOptions) => void;
  activeTarget: string | null;
  isRunning: boolean;
}

const TourContext = createContext<TourContextValue | null>(null);
const SEEN_PREFIX = '@tour_seen_';

export const TourStorage = {
  async hasSeen(name: string) {
    try {
      return (await AsyncStorage.getItem(SEEN_PREFIX + name)) === '1';
    } catch {
      return true; // never trap a user in a tour because storage failed
    }
  },
  async markSeen(name: string) {
    try {
      await AsyncStorage.setItem(SEEN_PREFIX + name, '1');
    } catch {}
  },
  async resetAll(names: string[]) {
    try {
      await AsyncStorage.multiRemove(names.map((n) => SEEN_PREFIX + n));
    } catch {}
  },
};

export function TourProvider({ children }: { children: ReactNode }) {
  // How many mounted <TourTarget>s carry each id.
  const mounted = useRef(new Map<string, number>());
  const [tour, setTour] = useState<{
    name: string;
    steps: TourStep[];
    options: TourOptions;
    index: number;
  } | null>(null);

  const register = useCallback((id: string) => {
    mounted.current.set(id, (mounted.current.get(id) ?? 0) + 1);
    return () => {
      const n = (mounted.current.get(id) ?? 1) - 1;
      if (n <= 0) mounted.current.delete(id);
      else mounted.current.set(id, n);
    };
  }, []);

  const start = useCallback((name: string, steps: TourStep[], options: TourOptions = {}) => {
    const first = steps.findIndex((s) => mounted.current.has(s.target));
    if (first < 0) return;
    setTour({ name, steps, options, index: first });
  }, []);

  const finish = useCallback(() => {
    setTour((t) => {
      if (t) TourStorage.markSeen(t.name);
      return null;
    });
  }, []);

  /** Move to the next (or previous) step whose element is actually on screen. */
  const go = useCallback((dir: 1 | -1) => {
    Haptics.selectionAsync();
    setTour((t) => {
      if (!t) return t;
      let i = t.index + dir;
      while (i >= 0 && i < t.steps.length && !mounted.current.has(t.steps[i].target)) i += dir;
      if (i >= t.steps.length) {
        TourStorage.markSeen(t.name);
        return null;
      }
      if (i < 0) return t;
      return { ...t, index: i };
    });
  }, []);

  // Android back leaves the tour instead of navigating underneath it.
  useEffect(() => {
    if (!tour) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    return () => sub.remove();
  }, [tour, finish]);

  const activeTarget = tour ? tour.steps[tour.index].target : null;
  const isRunning = tour != null;
  const value = useMemo(
    () => ({ register, start, activeTarget, isRunning }),
    [register, start, activeTarget, isRunning]
  );

  // Numbering only counts steps that will actually be shown.
  const visible = tour ? tour.steps.filter((s) => mounted.current.has(s.target)) : [];
  const position = tour ? Math.max(0, visible.indexOf(tour.steps[tour.index])) : 0;

  return (
    <TourContext.Provider value={value}>
      {children}
      {tour && (
        <TipCard
          step={tour.steps[tour.index]}
          position={position}
          count={visible.length}
          finalAction={tour.options.finalAction}
          onNext={() => go(1)}
          onBack={() => go(-1)}
          onSkip={finish}
        />
      )}
    </TourContext.Provider>
  );
}

function TipCard({
  step,
  position,
  count,
  finalAction,
  onNext,
  onBack,
  onSkip,
}: {
  step: TourStep;
  position: number;
  count: number;
  finalAction?: TourOptions['finalAction'];
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const isLast = position >= count - 1;
  const top = step.placement === 'top';
  // Three buttons and the dots don't fit one row on a phone, so the last tip
  // with an action puts its buttons on a full-width row of their own.
  const stacked = isLast && !!finalAction;

  useEffect(() => {
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [step, slide]);

  // Bottom placement clears the floating tab bar.
  const placement = top ? { top: insets.top + 12 } : { bottom: insets.bottom + 104 };
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [top ? -16 : 16, 0] });

  return (
    <Animated.View
      style={[styles.card, placement, { opacity: slide, transform: [{ translateY }] }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.cardTop}>
        <Text style={styles.counter}>
          TIP {position + 1} OF {count}
        </Text>
        {!isLast && (
          <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.skip}>SKIP TOUR</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.title}>{step.title}</Text>
      <Text style={styles.body}>{step.body}</Text>
      <View style={[styles.footer, stacked && styles.footerStacked]}>
        <View style={styles.dots}>
          {Array.from({ length: count }, (_, i) => (
            <View key={i} style={[styles.dot, i === position && styles.dotOn]} />
          ))}
        </View>
        <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
          {position > 0 && (
            <TouchableOpacity style={styles.back} onPress={onBack}>
              <Text style={styles.backText}>BACK</Text>
            </TouchableOpacity>
          )}
          {isLast && finalAction ? (
            <>
              <TouchableOpacity style={styles.back} onPress={onNext}>
                <Text style={styles.backText}>DONE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.next, styles.nextStacked]}
                onPress={() => {
                  onNext();
                  finalAction.onPress();
                }}
              >
                <Text style={styles.nextText} numberOfLines={1}>
                  {finalAction.label}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.next} onPress={onNext}>
              <Text style={styles.nextText}>{isLast ? "LET'S GO" : 'NEXT'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

/** Pulsing lime outline drawn by the active target around itself. */
function Ring() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
        },
      ]}
    />
  );
}

/**
 * Marks an element the tour can talk about. Layout is unchanged; when its step
 * is active it outlines itself. Pass `scrollRef` when it's a direct child of a
 * ScrollView's content, so it can scroll itself into view.
 */
export function TourTarget({
  id,
  children,
  style,
  scrollRef,
}: {
  id: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const ctx = useContext(TourContext);
  const register = ctx?.register;
  const offsetY = useRef<number | null>(null);
  const active = ctx?.activeTarget === id;

  useEffect(() => register?.(id), [register, id]);

  useEffect(() => {
    if (active && scrollRef?.current && offsetY.current != null) {
      scrollRef.current.scrollTo({ y: Math.max(0, offsetY.current - 140), animated: true });
    }
  }, [active, scrollRef]);

  return (
    <View
      style={style}
      onLayout={scrollRef ? (e) => (offsetY.current = e.nativeEvent.layout.y) : undefined}
    >
      {children}
      {active && <Ring />}
    </View>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>');
  return ctx;
}

/**
 * Start a tour the first time a screen is focused, after a short pause so the
 * screen has loaded and the right elements are mounted.
 */
export function useFirstVisitTour(
  name: string,
  steps: TourStep[],
  options?: TourOptions,
  { enabled = true, delayMs = 600 }: { enabled?: boolean; delayMs?: number } = {}
) {
  const { start, isRunning } = useTour();
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const runningRef = useRef(isRunning);
  runningRef.current = isRunning;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let cancelled = false;
      const timer = setTimeout(async () => {
        if (cancelled || runningRef.current || (await TourStorage.hasSeen(name))) return;
        if (!cancelled) start(name, stepsRef.current, optionsRef.current);
      }, delayMs);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [enabled, name, start, delayMs])
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    elevation: 24,
    backgroundColor: '#1F1F1F',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  counter: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, color: colors.accent },
  skip: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, color: colors.textDim },
  title: { fontFamily: fonts.heading, fontSize: 21, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { width: 18, backgroundColor: colors.accent },
  footerStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  buttons: { flexDirection: 'row', gap: 8 },
  buttonsStacked: { alignSelf: 'stretch' },
  nextStacked: { flex: 1, alignItems: 'center' },
  back: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  next: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  nextText: { fontFamily: fonts.heading, fontSize: 15, color: colors.bg },
  ring: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.accent,
  },
});
