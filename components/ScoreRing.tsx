import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fonts } from '@/constants/theme';

interface ScoreRingProps {
  /** 0-100. Pass null while the value is unknown to render an empty ring. */
  score: number | null;
  color: string;
  size?: number;
  strokeWidth?: number;
  label?: string;
  /** Shown instead of the number when there is no score yet. */
  placeholder?: string;
}

/**
 * Circular progress ring. Used by both the recovery hero and the sleep card, so
 * the two read as the same object at different sizes.
 */
export function ScoreRing({
  score,
  color,
  size = 180,
  strokeWidth = 14,
  label,
  placeholder = '--',
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score == null ? 0 : Math.min(100, Math.max(0, score)) / 100;
  const dashOffset = circumference * (1 - pct);
  const fontSize = size * 0.27;

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      {/* Rotated so the arc starts at 12 o'clock rather than 3 o'clock. */}
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {score != null && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        )}
      </Svg>

      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.score, { fontSize, color: score == null ? colors.textFaint : color }]}>
          {score == null ? placeholder : score}
        </Text>
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontFamily: fonts.numericHeavy,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 2,
  },
});
