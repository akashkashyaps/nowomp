import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import Svg, { Path, Rect, Line, Circle, Text as SvgText } from 'react-native-svg';
import { colors, fonts, chartColors } from '@/constants/theme';

interface HeartRateZoneChartProps {
  /** JSON [[x, bpm], ...] as stored — x is seconds from start in 'elapsed'
   *  mode and minutes from midnight in 'clock' mode. */
  samplesJson: string | null;
  maxHr: number;
  width: number;
  height?: number;
  /**
   * 'elapsed' labels the axis as time since the workout started; 'clock' labels
   * it as time of day, for the all-day chart where the x values are minutes
   * from midnight.
   */
  xAxisMode?: 'elapsed' | 'clock';
}

/**
 * Heart rate over time, drawn against shaded training zones.
 *
 * The zone bands are the point: a bare HR line tells you the number, but the
 * bands tell you what that number meant — whether you were working aerobically
 * or anaerobically at any moment.
 *
 * Percentages of max HR follow the conventional five-zone model used across
 * exercise physiology and by most training platforms.
 */
const ZONES = [
  { name: 'Z1', label: 'Easy', from: 0.5, to: 0.6, color: '#3987E5' },
  { name: 'Z2', label: 'Fat burn', from: 0.6, to: 0.7, color: '#199E70' },
  { name: 'Z3', label: 'Aerobic', from: 0.7, to: 0.8, color: '#C98500' },
  { name: 'Z4', label: 'Threshold', from: 0.8, to: 0.9, color: '#D95926' },
  { name: 'Z5', label: 'Max', from: 0.9, to: 1.0, color: '#E66767' },
] as const;

const PAD_LEFT = 34;
const PAD_TOP = 10;
const PAD_BOTTOM = 18;

/** Vertical breathing room, in bpm, when the data drives the axis. */
const HEADROOM_BPM = 6;

/**
 * A gap this many times the typical sample spacing is treated as the device
 * not recording, and breaks the line rather than being drawn across.
 *
 * Relative rather than absolute because the two modes use different units and
 * different downsampling — a workout trace is seconds apart, an all-day trace
 * is minutes apart.
 */
const GAP_FACTOR = 6;

/** Time of day from minutes past midnight. */
const fmtClock = (min: number) => {
  const h24 = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')}${h24 < 12 ? 'am' : 'pm'}`;
};

/** Time into the workout from seconds since it started. */
const fmtElapsed = (sec: number) => {
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Deliberately NOT wrapped in memo, unlike TrendChart.
 *
 * TrendChart earns it — eight instances mount together on the health tab. Only
 * one of these is ever mounted per screen, the costly geometry is already
 * behind useMemo, and scrub state lives inside the component where memo can't
 * help anyway. What memo did buy was a crash: changing this export from a
 * function to a memo object while the app was hot-reloading left mounted fibers
 * tagged FunctionComponent holding an object type, which React reports as
 * "Component is not a function (it is Object)".
 */
export function HeartRateZoneChart({
  samplesJson,
  maxHr,
  width,
  height = 170,
  xAxisMode = 'elapsed',
}: HeartRateZoneChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isClock = xAxisMode === 'clock';

  const samples = useMemo<[number, number][]>(() => {
    try {
      return samplesJson ? JSON.parse(samplesJson) : [];
    } catch {
      return [];
    }
  }, [samplesJson]);

  const plotW = width - PAD_LEFT;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const axisY = PAD_TOP + plotH;

  const geometry = useMemo(() => {
    if (samples.length < 2) return null;

    let dataMin = Infinity;
    let dataMax = -Infinity;
    let minAt = samples[0];
    let maxAt = samples[0];
    for (const s of samples) {
      if (s[1] < dataMin) { dataMin = s[1]; minAt = s; }
      if (s[1] > dataMax) { dataMax = s[1]; maxAt = s; }
    }

    // All five zones are always in view, and the window grows past them
    // whenever the data falls outside.
    //
    // Both halves of that matter. The bounds used to be fixed to the zone model
    // in both directions, including a hard maxHr * 0.45 floor — 85bpm for a 190
    // max. A resting heart rate of 55 mapped to a y below the baseline, so the
    // trace was drawn underneath the axis and off the bottom of the chart, and
    // on the all-day chart that is most of the day.
    //
    // Cropping the TOP to the highest zone reached was tried and reverted: it
    // used the height better on easy days, but a chart that shows four zones
    // one day and two the next reads as cut off, and two workouts stop being
    // comparable at a glance. A stable frame is worth more than tight spacing.
    const loBpm = Math.min(maxHr * 0.45, dataMin - HEADROOM_BPM);
    const hiBpm = Math.max(maxHr * 1.02, dataMax + HEADROOM_BPM);
    const y = (bpm: number) =>
      PAD_TOP + plotH - ((bpm - loBpm) / (hiBpm - loBpm)) * plotH;

    // Clock mode always spans midnight to midnight, so a morning run appears on
    // the left rather than being stretched across the whole width.
    const spanEnd = isClock ? 24 * 60 : samples[samples.length - 1][0] || 1;
    const x = (v: number) => PAD_LEFT + (v / spanEnd) * plotW;

    // Typical spacing, as the median of the gaps. The mean would be dragged up
    // by exactly the gaps being detected.
    const deltas: number[] = [];
    for (let i = 1; i < samples.length; i++) deltas.push(samples[i][0] - samples[i - 1][0]);
    deltas.sort((a, b) => a - b);
    const typicalGap = deltas[Math.floor(deltas.length / 2)] || 1;
    const gapLimit = typicalGap * GAP_FACTOR;

    // Break the path where the device stopped recording, so a watch taken off
    // for three hours reads as a gap rather than a straight line through it.
    let path = '';
    for (let i = 0; i < samples.length; i++) {
      const startsSegment = i === 0 || samples[i][0] - samples[i - 1][0] > gapLimit;
      path += `${startsSegment ? 'M' : 'L'}${x(samples[i][0]).toFixed(1)},${y(samples[i][1]).toFixed(1)}`;
      if (i < samples.length - 1) path += ' ';
    }

    // Time spent in each zone, plus everything below Z1.
    //
    // Sub-Z1 time has to be counted: on an all-day trace almost all of the time
    // is below Z1, and percentages taken over zoned time alone would report a
    // two-minute walk as most of the day.
    const zoneTime = ZONES.map(() => 0);
    let belowTime = 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i][1];
      if (i === samples.length - 1) break;
      // Capped for the same reason the line breaks — an unrecorded gap is not
      // time spent at the last observed heart rate.
      const span = Math.min(samples[i + 1][0] - samples[i][0], gapLimit);
      const frac = samples[i][1] / maxHr;
      const zi = ZONES.findIndex((z) => frac >= z.from && frac < z.to);
      if (zi >= 0) zoneTime[zi] += span;
      else if (frac < ZONES[0].from) belowTime += span;
      else zoneTime[ZONES.length - 1] += span; // above 100% of estimated max
    }
    const totalTime = zoneTime.reduce((a, b) => a + b, belowTime) || 1;
    const avgBpm = sum / samples.length;

    // Only label the axis ends when they sit clear of the nearest zone label,
    // which they do exactly when the data pushed the window past the model.
    const showLoLabel = y(loBpm) - y(maxHr * ZONES[0].from) > 12;
    const showHiLabel = y(maxHr * ZONES[ZONES.length - 1].to) - y(hiBpm) > 12;

    return {
      x, y, path, spanEnd, loBpm, hiBpm, zoneTime, belowTime, totalTime,
      avgBpm, minAt, maxAt, showLoLabel, showHiLabel,
    };
  }, [samples, maxHr, plotW, plotH, isClock]);

  // Map a touch x-position onto the nearest sample.
  //
  // Unlike the trend charts, x here is a real time value rather than an evenly
  // spaced index, so the touch has to be converted to a time and then searched
  // for — the samples are not at regular offsets across the width.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Only claim a drag once it is clearly horizontal, so the surrounding
        // ScrollView keeps working when the finger moves down the page.
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 4,
        onPanResponderTerminationRequest: () => true,
        onPanResponderGrant: (evt) => pick(evt.nativeEvent.locationX),
        onPanResponderMove: (evt) => pick(evt.nativeEvent.locationX),
        onPanResponderRelease: () => setActiveIndex(null),
        onPanResponderTerminate: () => setActiveIndex(null),
      }),
    // `pick` closes over geometry, so the responder is rebuilt when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geometry, samples.length]
  );

  function pick(locationX: number) {
    if (!geometry || samples.length < 2) return;
    const ratio = Math.min(1, Math.max(0, (locationX - PAD_LEFT) / plotW));
    const target = ratio * geometry.spanEnd;

    // Binary search for the first sample at or past the touched time, then take
    // whichever neighbour is closer.
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid][0] < target) lo = mid + 1;
      else hi = mid;
    }
    const prev = Math.max(0, lo - 1);
    const nearest =
      Math.abs(samples[prev][0] - target) <= Math.abs(samples[lo][0] - target) ? prev : lo;
    setActiveIndex(nearest);
  }

  if (!geometry) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>NO HEART RATE RECORDED</Text>
      </View>
    );
  }

  const {
    x, y, path, spanEnd, loBpm, hiBpm, zoneTime, belowTime, totalTime,
    avgBpm, minAt, maxAt, showLoLabel, showHiLabel,
  } = geometry;

  const active = activeIndex != null;
  const point = active ? samples[activeIndex] : null;
  const pointFrac = point ? point[1] / maxHr : 0;
  const pointZone = point
    ? ZONES.find((z) => pointFrac >= z.from && pointFrac < z.to) ??
      (pointFrac >= 1 ? ZONES[ZONES.length - 1] : null)
    : null;

  const fmtTime = isClock ? fmtClock : fmtElapsed;

  return (
    <View>
      {/* Scrub readout. Falls back to the average so the row always carries a
          number rather than appearing only on touch. */}
      <View style={styles.readout}>
        <Text style={styles.readoutLabel}>
          {point ? fmtTime(point[0]).toUpperCase() : 'AVG'}
        </Text>
        <View style={styles.readoutRight}>
          {pointZone ? (
            <Text style={[styles.readoutZone, { color: pointZone.color }]}>
              {pointZone.name} {pointZone.label.toUpperCase()}
            </Text>
          ) : point ? (
            <Text style={styles.readoutZone}>BELOW Z1</Text>
          ) : null}
          <Text style={styles.readoutValue}>
            {Math.round(point ? point[1] : avgBpm)}
            <Text style={styles.readoutUnit}> bpm</Text>
          </Text>
        </View>
      </View>

      <View {...panResponder.panHandlers}>
        <Svg width={width} height={height}>
          {/* Everything below Z1. Neutral rather than a sixth hue: it is the
              absence of training, not another zone. */}
          <Rect
            x={PAD_LEFT}
            y={y(maxHr * ZONES[0].from)}
            width={plotW}
            height={Math.max(0, axisY - y(maxHr * ZONES[0].from))}
            fill={colors.textFaint}
            opacity={0.07}
          />

          {ZONES.map((z) => {
            // Clamp to the plot: the top zone runs to 100% of max HR, which the
            // window only reaches when nothing exceeded it.
            const top = Math.max(PAD_TOP, y(maxHr * z.to));
            const bottom = Math.min(axisY, y(maxHr * z.from));
            return (
              <Rect
                key={z.name}
                x={PAD_LEFT}
                y={top}
                width={plotW}
                height={Math.max(0, bottom - top)}
                fill={z.color}
                // Low enough that the trace stays the dominant mark, high
                // enough that the bands read as distinct regions.
                opacity={0.16}
              />
            );
          })}

          {/* Boundary lines with their bpm value, so the trace can be read
              against real numbers rather than only against colour. */}
          {ZONES.map((z) => {
            const bpm = maxHr * z.from;
            const yy = y(bpm);
            if (yy > axisY || yy < PAD_TOP) return null;
            return (
              <React.Fragment key={`b-${z.name}`}>
                <Line
                  x1={PAD_LEFT}
                  y1={yy}
                  x2={width}
                  y2={yy}
                  stroke={colors.border}
                  strokeWidth={0.5}
                />
                <SvgText
                  x={PAD_LEFT - 4}
                  y={yy + 3}
                  fill={colors.textFaint}
                  fontSize={8}
                  fontFamily={fonts.body}
                  textAnchor="end"
                >
                  {Math.round(bpm)}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* The window's own bounds, whenever the data set them. Without these
              an expanded axis gives no clue how far the trace really goes. */}
          {showLoLabel && (
            <SvgText
              x={PAD_LEFT - 4}
              y={axisY}
              fill={colors.textFaint}
              fontSize={8}
              fontFamily={fonts.body}
              textAnchor="end"
            >
              {Math.round(loBpm)}
            </SvgText>
          )}
          {showHiLabel && (
            <SvgText
              x={PAD_LEFT - 4}
              y={PAD_TOP + 6}
              fill={colors.textFaint}
              fontSize={8}
              fontFamily={fonts.body}
              textAnchor="end"
            >
              {Math.round(hiBpm)}
            </SvgText>
          )}

          {ZONES.map((z) => {
            const mid =
              (Math.max(PAD_TOP, y(maxHr * z.to)) + Math.min(axisY, y(maxHr * z.from))) / 2;
            return (
              <SvgText
                key={`lbl-${z.name}`}
                x={PAD_LEFT + 4}
                y={mid + 3}
                fill={z.color}
                fontSize={7}
                fontFamily={fonts.bodyBold}
              >
                {z.name}
              </SvgText>
            );
          })}

          <Path
            d={path}
            stroke={colors.text}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />

          {/* Peak and trough, the two numbers people look for first. Ringed in
              the surface colour so they stay legible over the trace. Hidden
              while scrubbing, so they don't compete with the cursor. */}
          {!active &&
            [
              { at: maxAt, key: 'peak', color: chartColors.red, above: true },
              { at: minAt, key: 'low', color: chartColors.blue, above: false },
            ].map(({ at, key, color, above }) => (
              <React.Fragment key={key}>
                <Circle
                  cx={x(at[0])}
                  cy={y(at[1])}
                  r={3.5}
                  fill={color}
                  stroke={colors.card}
                  strokeWidth={2}
                />
                <SvgText
                  x={Math.min(width - 4, Math.max(PAD_LEFT + 12, x(at[0])))}
                  y={above ? Math.max(PAD_TOP + 8, y(at[1]) - 7) : Math.min(axisY - 3, y(at[1]) + 13)}
                  fill={colors.textMuted}
                  fontSize={8}
                  fontFamily={fonts.numeric}
                  textAnchor="middle"
                >
                  {Math.round(at[1])}
                </SvgText>
              </React.Fragment>
            ))}

          {point && (
            <>
              <Line
                x1={x(point[0])}
                y1={PAD_TOP}
                x2={x(point[0])}
                y2={axisY}
                stroke={colors.text}
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <Circle
                cx={x(point[0])}
                cy={y(point[1])}
                r={5}
                fill={pointZone?.color ?? colors.textMuted}
                stroke={colors.card}
                strokeWidth={2}
              />
            </>
          )}

          <Line
            x1={PAD_LEFT}
            y1={axisY}
            x2={width}
            y2={axisY}
            stroke={colors.border}
            strokeWidth={1}
          />
          {(isClock
            ? [
                { at: 0, label: '12am' },
                { at: 6 * 60, label: '6am' },
                { at: 12 * 60, label: '12pm' },
                { at: 18 * 60, label: '6pm' },
                { at: 24 * 60, label: '12am' },
              ]
            : [
                { at: 0, label: '0:00' },
                { at: spanEnd, label: fmtElapsed(spanEnd) },
              ]
          ).map((t, i, arr) => (
            <SvgText
              key={`t-${t.at}`}
              x={x(t.at)}
              y={height - 5}
              fill={colors.textFaint}
              fontSize={8}
              fontFamily={fonts.body}
              textAnchor={i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}
            >
              {t.label}
            </SvgText>
          ))}
        </Svg>
      </View>

      <View style={styles.legend}>
        {ZONES.map((z, i) => (
          <View key={z.name} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: z.color }]} />
            <Text style={styles.legendLabel}>{z.label}</Text>
            <Text style={styles.legendValue}>
              {Math.round((zoneTime[i] / totalTime) * 100)}%
            </Text>
          </View>
        ))}
        {belowTime > 0 && (
          <>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, styles.belowSwatch]} />
              <Text style={styles.legendLabel}>Below Z1</Text>
              <Text style={styles.legendValue}>
                {Math.round((belowTime / totalTime) * 100)}%
              </Text>
            </View>
            {/* Named literally, because "rest" invited the obvious objection —
                a slow walk is not resting, but it can still sit under half your
                max heart rate. */}
            <Text style={styles.legendNote}>
              Below Z1 is time under {Math.round(maxHr * ZONES[0].from)} bpm — moving,
              but not hard enough to count as training.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
    letterSpacing: 1,
  },
  readout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  readoutLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textFaint,
    letterSpacing: 1,
  },
  readoutRight: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  readoutZone: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.textFaint,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  readoutValue: {
    fontFamily: fonts.numericHeavy,
    fontSize: 18,
    color: colors.text,
  },
  readoutUnit: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.textMuted,
  },
  legend: {
    marginTop: 10,
    gap: 5,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  belowSwatch: {
    backgroundColor: colors.textFaint,
    opacity: 0.4,
  },
  legendLabel: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
  },
  legendValue: {
    fontFamily: fonts.numeric,
    fontSize: 11,
    color: colors.text,
  },
  legendNote: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.textFaint,
    lineHeight: 13,
    marginTop: 2,
  },
});
