import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';
import { colors, fonts, sleepStageColors } from '@/constants/theme';
import type { HealthSleepStage, SleepStageName } from '@/database/database';

interface SleepHypnogramProps {
  stages: HealthSleepStage[];
  sessionStart: string;
  sessionEnd: string;
  /** Defaults to the screen width minus the standard 32px page padding. */
  chartWidth?: number;
}

/** Lane order, top to bottom — the conventional hypnogram arrangement. */
const LANES: SleepStageName[] = ['awake', 'rem', 'light', 'deep'];
const LANE_HEIGHT = 18;
const LANE_GAP = 6;
const AXIS_HEIGHT = 18;

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/**
 * Sleep stage hypnogram.
 *
 * Drawn with raw SVG rather than a chart library: this is a time axis with
 * variable-width segments, which stacked-bar charts cannot express.
 */
export function SleepHypnogram({
  stages,
  sessionStart,
  sessionEnd,
  chartWidth: widthProp,
}: SleepHypnogramProps) {
  const chartWidth = widthProp ?? Dimensions.get('window').width - 64;
  const start = new Date(sessionStart).getTime();
  const end = new Date(sessionEnd).getTime();
  const duration = Math.max(1, end - start);

  const chartHeight = LANES.length * (LANE_HEIGHT + LANE_GAP);
  const laneY = (stage: SleepStageName) => {
    const idx = LANES.indexOf(stage);
    // out_of_bed and unknown ride in the awake lane rather than vanishing.
    return (idx === -1 ? 0 : idx) * (LANE_HEIGHT + LANE_GAP);
  };

  const x = (iso: string) =>
    ((new Date(iso).getTime() - start) / duration) * chartWidth;

  if (stages.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>NO STAGE DATA FOR THIS NIGHT</Text>
      </View>
    );
  }

  const midpoint = new Date(start + duration / 2).toISOString();

  return (
    <View>
      <Svg width={chartWidth} height={chartHeight + AXIS_HEIGHT}>
        {LANES.map((lane) => (
          <Line
            key={`grid-${lane}`}
            x1={0}
            y1={laneY(lane) + LANE_HEIGHT / 2}
            x2={chartWidth}
            y2={laneY(lane) + LANE_HEIGHT / 2}
            stroke={colors.card}
            strokeWidth={1}
          />
        ))}

        {stages.map((stage) => {
          const segX = x(stage.start_time);
          // Guard the minimum width or brief stages disappear entirely.
          const segWidth = Math.max(1, x(stage.end_time) - segX);
          return (
            <Rect
              key={stage.id}
              x={segX}
              y={laneY(stage.stage)}
              width={segWidth}
              height={LANE_HEIGHT}
              rx={2}
              fill={sleepStageColors[stage.stage] ?? sleepStageColors.unknown}
            />
          );
        })}

        <SvgText
          x={0}
          y={chartHeight + 13}
          fill={colors.textFaint}
          fontSize={9}
          fontFamily={fonts.body}
        >
          {formatTime(sessionStart)}
        </SvgText>
        <SvgText
          x={chartWidth / 2}
          y={chartHeight + 13}
          fill={colors.textFaint}
          fontSize={9}
          fontFamily={fonts.body}
          textAnchor="middle"
        >
          {formatTime(midpoint)}
        </SvgText>
        <SvgText
          x={chartWidth}
          y={chartHeight + 13}
          fill={colors.textFaint}
          fontSize={9}
          fontFamily={fonts.body}
          textAnchor="end"
        >
          {formatTime(sessionEnd)}
        </SvgText>
      </Svg>

      <View style={styles.legend}>
        {LANES.map((lane) => (
          <View key={lane} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: sleepStageColors[lane] }]} />
            <Text style={styles.legendLabel}>{lane.toUpperCase()}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    letterSpacing: 1,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
});
