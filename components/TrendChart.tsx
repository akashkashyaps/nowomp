import { useState, useMemo, memo } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import Svg, { Path, Circle, Line, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, fonts } from '@/constants/theme';

interface TrendChartProps {
  title: string;
  data: { date: string; value: number }[];
  width: number;
  color?: string;
  unit?: string;
  /** Formats the displayed figure; defaults to a rounded number. */
  format?: (value: number) => string;
  height?: number;
  /**
   * 'line' for continuous measures (HRV, weight, resting HR) where the value
   * exists between readings; 'bar' for discrete daily totals like steps, where
   * each day is a separate quantity and a connecting line would imply a
   * continuity that isn't there.
   */
  variant?: 'line' | 'bar';
  /** Draws a reference line, e.g. a daily step goal. */
  goal?: number | null;
  goalLabel?: string;
}

const PADDING_TOP = 12;
const PADDING_BOTTOM = 20;

const formatDateLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/**
 * Interactive 30-day trend line.
 *
 * Touch anywhere (or drag) to scrub: the header switches from the latest value
 * to the value under your finger, with its date. Built on react-native-svg
 * rather than a chart library because chart-kit exposes no touch position.
 */
function TrendChartBase({
  title,
  data,
  width,
  color = colors.accent,
  unit,
  format,
  height = 150,
  variant = 'line',
  goal = null,
  goalLabel,
}: TrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const fmt = format ?? ((v: number) => String(Math.round(v)));
  const chartHeight = height - PADDING_TOP - PADDING_BOTTOM;

  const geometry = useMemo(() => {
    if (data.length < 2) return null;

    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    let lo: number;
    let hi: number;
    if (variant === 'bar') {
      // Bars encode magnitude by length, so the axis must start at zero — a
      // truncated baseline makes a 9k day look twice a 8k day. The top also has
      // to clear the goal line, or a goal above every bar would sit off-chart.
      lo = 0;
      hi = Math.max(max, goal ?? 0) * 1.12 || 1;
    } else {
      // Pad a flat series so the line sits mid-chart instead of on an edge.
      const span = max - min || Math.max(1, Math.abs(max) * 0.1);
      lo = min - span * 0.1;
      hi = max + span * 0.1;
    }

    const x = (i: number) => (i / (data.length - 1)) * width;
    const y = (v: number) => PADDING_TOP + chartHeight - ((v - lo) / (hi - lo)) * chartHeight;

    const points = data.map((d, i) => ({ x: x(i), y: y(d.value) }));
    const line = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' ');
    const area =
      `${line} L${points[points.length - 1].x.toFixed(2)},${(PADDING_TOP + chartHeight).toFixed(2)}` +
      ` L${points[0].x.toFixed(2)},${(PADDING_TOP + chartHeight).toFixed(2)} Z`;

    // A 2px gap between bars keeps adjacent days visually separate; below ~3px
    // total width the gap would swallow the bar, so it is dropped.
    const slot = width / data.length;
    const barWidth = Math.max(1.5, slot - (slot > 4 ? 2 : 0));
    const bars = data.map((d, i) => {
      const top = y(d.value);
      return {
        x: i * slot + (slot - barWidth) / 2,
        y: top,
        width: barWidth,
        height: Math.max(1, PADDING_TOP + chartHeight - top),
      };
    });

    const goalY = goal != null && goal > 0 ? y(goal) : null;

    return { points, line, area, bars, goalY, min, max, values };
  }, [data, width, chartHeight, variant, goal]);

  // Map a touch x-position onto the nearest data point.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim a tap on the chart, but only take over a drag once it is clearly
        // horizontal. Returning true unconditionally made every chart swallow
        // vertical swipes, so the page could not be scrolled past them.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 4,
        // Never block the parent ScrollView from reclaiming a vertical gesture.
        onPanResponderTerminationRequest: () => true,
        onPanResponderGrant: (evt) => {
          if (data.length < 2) return;
          const ratio = Math.min(1, Math.max(0, evt.nativeEvent.locationX / width));
          setActiveIndex(Math.round(ratio * (data.length - 1)));
        },
        onPanResponderMove: (evt) => {
          if (data.length < 2) return;
          const ratio = Math.min(1, Math.max(0, evt.nativeEvent.locationX / width));
          setActiveIndex(Math.round(ratio * (data.length - 1)));
        },
        onPanResponderRelease: () => setActiveIndex(null),
        onPanResponderTerminate: () => setActiveIndex(null),
      }),
    [data.length, width]
  );

  if (!geometry) {
    return (
      <View style={styles.wrapper}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.empty}>NOT ENOUGH DATA YET</Text>
      </View>
    );
  }

  const { points, line, area, bars, goalY, min, max, values } = geometry;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;

  const shownIndex = activeIndex ?? data.length - 1;
  const shown = data[shownIndex];
  const active = activeIndex != null;
  const cursor = points[shownIndex];

  const gradientId = `grad-${title.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.dateLabel}>
            {active ? formatDateLabel(shown.date) : 'LATEST'}
          </Text>
        </View>
        <Text style={[styles.latest, { color }]}>
          {fmt(shown.value)}
          {unit ? <Text style={styles.unit}> {unit}</Text> : null}
        </Text>
      </View>

      <View {...panResponder.panHandlers}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.25" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {variant === 'bar' ? (
            bars.map((b, i) => (
              <Rect
                key={i}
                x={b.x}
                y={b.y}
                width={b.width}
                height={b.height}
                rx={Math.min(2, b.width / 2)}
                fill={color}
                // Dim the days that missed the goal so hitting it reads at a
                // glance, without needing to trace each bar against the line.
                opacity={
                  goal != null && data[i].value < goal
                    ? active && i === shownIndex
                      ? 0.85
                      : 0.4
                    : 1
                }
              />
            ))
          ) : (
            <>
              <Path d={area} fill={`url(#${gradientId})`} />
              <Path d={line} stroke={color} strokeWidth={2} fill="none" />
            </>
          )}

          {goalY != null && (
            <Line
              x1={0}
              y1={goalY}
              x2={width}
              y2={goalY}
              stroke={colors.textMuted}
              strokeWidth={1}
              strokeDasharray="4,3"
            />
          )}

          {/* Bars get an outline rather than a crosshair — the mark itself is
              already wide enough to identify, and a vertical line through it
              would just add noise. */}
          {active && variant === 'bar' && bars[shownIndex] && (
            <Rect
              x={bars[shownIndex].x - 1}
              y={bars[shownIndex].y - 1}
              width={bars[shownIndex].width + 2}
              height={bars[shownIndex].height + 1}
              rx={2}
              fill="none"
              stroke={colors.text}
              strokeWidth={1.5}
            />
          )}

          {active && variant === 'line' && (
            <>
              <Line
                x1={cursor.x}
                y1={PADDING_TOP}
                x2={cursor.x}
                y2={PADDING_TOP + chartHeight}
                stroke={colors.textFaint}
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <Circle
                cx={cursor.x}
                cy={cursor.y}
                r={5}
                fill={color}
                stroke={colors.bg}
                strokeWidth={2}
              />
            </>
          )}
        </Svg>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.stat}>AVG {fmt(avg)}</Text>
        {goal != null && goal > 0 ? (
          // With a goal set, "how often did I hit it" is more useful than the
          // series low.
          <Text style={styles.stat}>
            {values.filter((v) => v >= goal).length}/{values.length} HIT
            {goalLabel ? ` ${goalLabel}` : ''}
          </Text>
        ) : (
          <Text style={styles.stat}>LOW {fmt(min)}</Text>
        )}
        <Text style={styles.stat}>HIGH {fmt(max)}</Text>
        <Text style={styles.stat}>{data.length}D</Text>
      </View>
    </View>
  );
}

/**
 * Memoised: eight of these render on the health tab, and each builds an SVG path
 * plus a PanResponder. Without this, any state change on the screen re-renders
 * all eight — enough work to stall the JS thread on a mid-range device.
 */
export const TrendChart = memo(TrendChartBase);

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  dateLabel: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.textFaint,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  latest: {
    fontFamily: fonts.numericHeavy,
    fontSize: 20,
  },
  unit: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  stat: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
    letterSpacing: 1,
    paddingVertical: 16,
    textAlign: 'center',
  },
});
