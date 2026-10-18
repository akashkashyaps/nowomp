/**
 * Penguin expressions for the home-screen widget. Same penguin as the
 * trophies; only the eyes and a few props change, so he reads as one
 * character whose mood follows your day. Pure data, renders to SVG strings
 * (the widget draws SVG natively).
 */
import { PENGUIN, toPaths, composeScene, composePowerUp } from './trophyArt';

export type WidgetMood =
  | 'hyped'
  | 'waiting'
  | 'urgent'
  | 'angry'
  | 'crying'
  | 'done'
  | 'unimpressed'
  | 'caring'
  | 'sleepy'
  | 'couch'
  | 'poked';

const W = 30;
const H = 29;
const PX = 3;
const PY = 3;
/** Left eye area inside the penguin; the right eye is its mirror 8 columns over. */
const EYE_X = 5;
const EYE_Y = 6;

const mirrorRow = (r: string) => [...r].reverse().join('');

/** Eye overlays, left eye only (6 wide x 7 tall). */
const EYES: Partial<Record<WidgetMood, string[]>> = {
  angry: ['KBBBBB', 'BKKBBB', 'BWWKKB', 'WWRRKW', 'WRRYRW', 'WWRRWW', 'BWWWWB'],
  crying: ['BWWWWB', 'WWWWWW', 'WWWWWW', 'WWWWWW', 'WWKKWW', 'WWKKWW', 'BWWWWB'],
  unimpressed: ['BBBBBB', 'BBBBBB', 'KKKKKK', 'WWWWWW', 'WWWKKW', 'BWWKKB', 'BBBBBB'],
  sleepy: ['BBBBBB', 'BBBBBB', 'BBBBBB', 'WKKKKW', 'BWWWWB', 'BBBBBB', 'BBBBBB'],
  poked: ['BWWWWB', 'WWWWWW', 'WWWWWW', 'WWKKWW', 'WWKKWW', 'WWWWWW', 'BWWWWB'],
  // Soft, happy closed eyes: ^ ^
  caring: ['BWWWWB', 'WWWWWW', 'WWKKWW', 'WKWWKW', 'WWWWWW', 'BWWWWB', 'BBBBBB'],
};

/** Props drawn on top, as [sprite, x, y] in widget-canvas coordinates. */
const PROPS: Partial<Record<WidgetMood, [string[], number, number][]>> = {
  hyped: [
    [['.Y.', 'YWY', '.Y.'], 0, 2],
    [['.Y.', 'YWY', '.Y.'], 26, 6],
  ],
  waiting: [
    // Tapping foot + a clock.
    [['W..', '.W.', 'W..'], 22, 24],
    [['.KKK.', 'KWWWK', 'KWKWK', 'KWKKK', 'KWWWK', '.KKK.'], 24, 0],
  ],
  urgent: [
    [['R', 'R', 'R', '.', 'R'], 2, 0],
    [['R', 'R', 'R', '.', 'R'], 27, 0],
    [['R', 'R', 'R', '.', 'R'], 14, 0],
  ],
  angry: [
    // Steam puffs either side of the head.
    [['.WW', 'W..', '.WW', '..W'], 0, 2],
    [['WW.', '..W', 'WW.', 'W..'], 27, 2],
  ],
  crying: [
    // Tear streams from both eyes down the cheeks.
    [['Z', 'Z', 'Z', 'Z', 'Z', 'Z'], PX + EYE_X + 1, PY + EYE_Y + 7],
    [['Z', 'Z', 'Z', 'Z', 'Z', 'Z'], PX + EYE_X + 12, PY + EYE_Y + 7],
  ],
  unimpressed: [
    // Flippers crossed over the belly.
    [['.BBBB.....BBBB.', 'BBBBBBBBBBBBBBB', '.BBBBBBBBBBBBB.'], PX + 5, PY + 16],
  ],
  sleepy: [[['ZZZ', '..Z', '.Z.', 'ZZZ'], 25, 0]],
  poked: [
    [['R', 'R', 'R', '.', 'R'], 26, 1],
    [['.W.', 'W.W', '.W.'], 0, 4],
  ],
  caring: [[['.R.R.', 'RRRRR', '.RRR.', '..R..'], 24, 1]],
};

function grid(mood: WidgetMood): string[] {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (sprite: string[], ox: number, oy: number) =>
    sprite.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch !== '.' && g[oy + y] && ox + x < W) g[oy + y][ox + x] = ch;
      })
    );
  put(PENGUIN, PX, PY);
  const eyes = EYES[mood];
  if (eyes) {
    put(eyes, PX + EYE_X, PY + EYE_Y);
    put(eyes.map(mirrorRow), PX + EYE_X + 8, PY + EYE_Y);
  }
  for (const [sprite, x, y] of PROPS[mood] ?? []) put(sprite, x, y);
  return g.map((r) => r.join(''));
}

const toSvg = (rows: string[]) => {
  const w = rows[0].length;
  const h = rows.length;
  const paths = toPaths(rows)
    .map((p) => `<path d="${p.d}" fill="${p.color}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 4}" height="${h * 4}">${paths}</svg>`;
};

const cache = new Map<WidgetMood, string>();

/** SVG for a mood; "done" is the powered-up penguin, "couch" the slumped one. */
export function widgetPenguinSvg(mood: WidgetMood): string {
  let svg = cache.get(mood);
  if (!svg) {
    svg =
      mood === 'done'
        ? toSvg(composePowerUp(0))
        : mood === 'couch'
          ? toSvg(composeScene('serial_skipper'))
          : toSvg(grid(mood));
    cache.set(mood, svg);
  }
  return svg;
}

/** Raw grids, for previewing outside the app. */
export const widgetMoodGrid = (mood: WidgetMood) =>
  mood === 'done' ? composePowerUp(0) : mood === 'couch' ? composeScene('serial_skipper') : grid(mood);

