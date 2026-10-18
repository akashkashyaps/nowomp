/**
 * Shared design tokens.
 *
 * These are the colors and fonts already used across the app, extracted so new
 * code stops re-declaring them. Existing screens still hardcode their hex values;
 * migrating them is a separate mechanical change, not part of the health feature.
 */

export const colors = {
  bg: '#0B0B0B',
  card: '#1A1A1A',
  border: '#333',

  accent: '#A8FF3E',
  cyan: '#00CFFF',
  danger: '#FF3131',
  warn: '#FFC93E',

  text: '#FFFFFF',
  textMuted: '#B0B0B0',
  textDim: '#888',
  textFaint: '#666',
} as const;

export const fonts = {
  heading: 'Anton-Regular',
  body: 'Inter-Regular',
  bodySemi: 'Inter-SemiBold',
  bodyBold: 'Inter-Bold',
  numeric: 'Orbitron-Bold',
  numericHeavy: 'Orbitron-Black',
} as const;

/**
 * Chart series colours.
 *
 * Eight hues in a fixed order — the order itself is the colour-blindness safety
 * mechanism, so slots are assigned in sequence and never reshuffled or cycled.
 * Validated against both #0B0B0B and #1A1A1A: every hue sits inside the
 * OKLCH lightness band, clears the chroma floor, holds ≥3:1 contrast, and the
 * worst adjacent pair stays above the protanopia/deuteranopia and normal-vision
 * separation floors.
 *
 * The lime accent is deliberately NOT here. At OKLCH L=0.91 it is far above the
 * 0.48–0.67 band for chart marks: it glows against dark and cannot be told apart
 * from its neighbours. It stays a UI accent — buttons, rings, highlights — while
 * data uses these.
 */
export const chartColors = {
  blue: '#3987E5',
  orange: '#D95926',
  aqua: '#199E70',
  yellow: '#C98500',
  magenta: '#D55181',
  green: '#008300',
  violet: '#9085E9',
  red: '#E66767',
} as const;

/**
 * Sleep stage colours — an ordinal ramp, not a categorical set.
 *
 * Sleep depth is a sequence, so the colour encodes it: one blue hue getting
 * darker as sleep deepens (REM → light → deep). That reads as an order at a
 * glance, which unrelated hues cannot do. Awake is deliberately outside the
 * ramp — a neutral grey, because it is the absence of sleep rather than a
 * depth. Lightness is monotonic and even the darkest step holds 3.5:1 on the
 * card surface, comfortably above the 2:1 an ordinal light-end needs.
 */
export const sleepStageColors = {
  awake: '#6E7681',
  rem: '#A8CFF5',
  light: '#6BA6EA',
  deep: '#2E6FC9',
  out_of_bed: '#3F444B',
  unknown: '#2A2A2A',
} as const;
