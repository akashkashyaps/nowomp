/**
 * Pixel-art trophies.
 *
 * Every trophy is the NoWomp penguin (from the app icon: dark head, flame eyes,
 * orange feet) with a prop, inside a round medal whose colour shows the tier.
 * Art is data: each sprite is rows of palette keys, '.' is transparent. Badges
 * are composed on a 44x44 grid and rendered by components/PixelBadge.tsx as
 * one SVG path per colour, so the whole trophy room stays cheap to draw.
 *
 * This file is pure data + functions (no React Native imports) so the art can
 * also be rendered outside the app for previewing.
 */

export type Tier = 'bronze' | 'silver' | 'gold' | 'lab' | 'shame';

export const PALETTE: Record<string, string> = {
  K: '#05060a', // outline
  B: '#2b3040', // body
  b: '#3c4357', // body highlight
  W: '#f4f4f0', // white
  e: '#d9d4c8', // belly shade
  O: '#ff8a1f', // beak / feet
  o: '#d4630c', // beak shade
  k: '#ffb36b', // feet highlight
  F: '#ff3d1f', // flame outer
  j: '#ff6a00', // flame mid
  Y: '#ffd23f', // flame core / yellow
  G: '#8a929c', // metal
  g: '#5b626b', // metal dark
  D: '#ff7a1a', // dumbbell plate
  C: '#ffd23f', // gold
  c: '#c99a12', // gold shade
  R: '#ff3131', // red
  r: '#b31d1d', // red shade
  U: '#3987e5', // blue
  u: '#25609f', // blue shade
  L: '#a8ff3e', // lime
  l: '#5f9e1c', // lime shade
  P: '#9085e9', // violet
  p: '#5d52b8', // violet shade
  T: '#9a6234', // wood / paper tan
  t: '#6b4120', // tan shade
  Z: '#bfe3ff', // ice / water / sparkle
  // medal rims: light, mid, dark
  '1': '#f2b27a', '2': '#c8793a', '3': '#7d4519',
  '4': '#ffffff', '5': '#c9d1d9', '6': '#7b8794',
  '7': '#fff1a8', '8': '#ffd23f', '9': '#b8860b',
  q: '#e4ffbf', s: '#a8ff3e', v: '#4c8a12',
  x: '#ff9a9a', y: '#ff3131', z: '#8f1414',
  n: '#4a4a4a', m: '#333333', i: '#262626',
  // medal interiors
  A: '#2a1a10', E: '#1c2128', H: '#2b2208', M: '#17260a', N: '#2a0e0e', Q: '#161616',
};

export const SIZE = 44;
type Grid = string[][];

const TIER_STYLE: Record<Tier | 'locked', { rim: [string, string, string]; bg: string }> = {
  bronze: { rim: ['1', '2', '3'], bg: 'A' },
  silver: { rim: ['4', '5', '6'], bg: 'E' },
  gold: { rim: ['7', '8', '9'], bg: 'H' },
  lab: { rim: ['q', 's', 'v'], bg: 'M' },
  shame: { rim: ['x', 'y', 'z'], bg: 'N' },
  locked: { rim: ['n', 'm', 'i'], bg: 'Q' },
};

// ------------------------------------------------------------------ helpers

const mirror = (half: string[]) => half.map((l) => l + [...l].reverse().join(''));
const flipH = (sprite: string[]) => sprite.map((r) => [...r].reverse().join(''));

const blank = (): Grid => Array.from({ length: SIZE }, () => Array(SIZE).fill('.'));

const stamp = (g: Grid, sprite: string[], ox: number, oy: number, map?: (ch: string) => string) => {
  sprite.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const gy = oy + y;
      const gx = ox + x;
      if (gy >= 0 && gy < SIZE && gx >= 0 && gx < SIZE) g[gy][gx] = map ? map(ch) : ch;
    })
  );
};

/** Round medal: 2px bevelled rim (lit top-left), 1px dark inner line, tinted interior, gem on top. */
const medal = (tier: Tier | 'locked'): Grid => {
  const g = blank();
  const { rim, bg } = TIER_STYLE[tier];
  const c = (SIZE - 1) / 2;
  const R = SIZE / 2 - 0.8;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d > R) continue;
      if (d > R - 2) g[y][x] = x + y < SIZE - 8 ? rim[0] : x + y > SIZE + 8 ? rim[2] : rim[1];
      else if (d > R - 3) g[y][x] = rim[2];
      else g[y][x] = bg;
    }
  stamp(g, [rim[0] + rim[0], rim[1] + rim[2]], SIZE / 2 - 1, 0);
  if (tier === 'shame') {
    // A crack through the rim: the Hall of Shame medals are damaged goods.
    for (const [x, y] of [[31, 2], [32, 3], [32, 4], [33, 5], [34, 5], [35, 6]]) g[y][x] = 'K';
  }
  return g;
};

// ------------------------------------------------------------------ penguin

const PENGUIN_RAW = mirror([
  '............',
  '........KKKK',
  '......KKbbBB',
  '.....KbbBBBB',
  '....KbBBBBBB',
  '....KbBBBBBB',
  '...KbBWWWWBB',
  '...KBWWWFWWB',
  '...KBWWFFjWB',
  '...KBWFjYjFB',
  '...KBWFYYYFB',
  '...KBWWFFFWB',
  '...KBBWWWWBB',
  '...KBBBBBBOO',
  '..KBBBBBBWoo',
  '.KBBBBWWWWWW',
  'KBBKBWWWWWWW',
  'KBKKWWWWWWWW',
  'KK.KWWWWWWWW',
  '...KBWWWWWWW',
  '...KBWWWWWWW',
  '....KBBWWWWW',
  '.....KKBBBBB',
  '....KOOOOK..',
  '...KOkOOOK..',
]);

/** Light from the top-left: highlights only on the left, belly shade on the right. */
export const PENGUIN = PENGUIN_RAW.map((row, y) => {
  const r = row.split('').map((ch, x) => (x >= 12 && ch === 'b' ? 'B' : ch));
  if (y >= 18 && y <= 21) {
    const last = r.lastIndexOf('W');
    if (last > 0) r[last] = 'e';
    if (y >= 19 && last > 1) r[last - 1] = 'e';
  }
  return r.join('');
});

const P_X = 10;
const P_Y = 8;
/** Left eye area inside the penguin (6x7); the right eye is its mirror at +8. */
const EYE_X = 5;
const EYE_Y = 6;

type Eyes = string[];
const EYES: Record<'sleepy' | 'sad' | 'tired', Eyes> = {
  sleepy: ['BBBBBB', 'BBBBBB', 'BBBBBB', 'WKKKKW', 'BWWWWB', 'BBBBBB', 'BBBBBB'],
  sad: ['BWWWWB', 'WWWWWW', 'WWWWWW', 'WWWWWW', 'WWKKWW', 'WWKKWW', 'BWWWWB'],
  tired: ['BBBBBB', 'BBBBBB', 'KKKKKK', 'WFjYjF', 'WFYYYF', 'BWWWWB', 'BPPPPB'],
};

const drawPenguin = (g: Grid, dx = 0, dy = 0, eyes?: keyof typeof EYES) => {
  stamp(g, PENGUIN, P_X + dx, P_Y + dy);
  if (eyes) {
    stamp(g, EYES[eyes], P_X + dx + EYE_X, P_Y + dy + EYE_Y);
    stamp(g, flipH(EYES[eyes]), P_X + dx + EYE_X + 8 + 0, P_Y + dy + EYE_Y);
  }
};

// ------------------------------------------------------------------ props

const S = {
  dumbbell: ['DDDDD', 'DkDDD', 'DDDDD', '.GGG.', '..G..', '..G..', '.GGG.', 'DDDDD', 'DkDDD', 'DDDDD'],
  crown: ['C....C....C', 'CC..CCC..CC', 'CCCCCCCCCCC', 'CcCRCCCRCcC', 'ccccccccccc'],
  helmet: [
    '......RRRR......',
    '....RRRRRRRR....',
    '...rRRRRRRRRr...',
    '.....CCCCCC.....',
    '...CCCCCCCCCC...',
    '..CCccccccccCC..',
    '..Cc........cC..',
    '..Cc........cC..',
  ],
  ratEars: ['.GGG.........GGG.', 'GGPGG.......GGPGG', 'GGPGG.......GGPGG', '.GGG.........GGG.'],
  ratTail: ['.....P', '....P.', 'PPPP..'],
  fire: [
    '..........Y...........',
    '....Y....YFY.....Y....',
    '...YF..Y.FjF..Y..FY...',
    '...FF.FF.FYF.FF..FF...',
    '..FjFFjFFjYjFFjFFjF...',
    '.FYYFYYFYYYYYFYYFYYF..',
    '.FYF..............FYF.',
    'FjF................FjF',
    'FF..................FF',
    'F....................F',
  ],
  chain: [
    '.GGG...GGG...GGG...GGG...GGG.',
    'G...GgG...GgG...GgG...GgG...G',
    '.GGG...GGG...GGG...GGG...GGG.',
  ],
  calendar: [
    'RRRRRRRRR',
    'RKRRRRRKR',
    'WWWWWWWWW',
    'WLWLWLWLW',
    'WWWWWWWWW',
    'WLWLWLWLW',
    'WWWWWWWWW',
    'WLWLWLWLW',
    'WWWWWWWWW',
  ],
  sun: [
    '...Y...Y...',
    '....YYY....',
    '.Y.YYYYY.Y.',
    '..YYYYYYY..',
    'YYYYYYYYYYY',
    '..YYYYYYY..',
    '.Y.YYYYY.Y.',
    '....YYY....',
  ],
  moon: ['..YYY.', '.YY...', 'YY....', 'YY....', 'YY....', '.YY...', '..YYY.'],
  stars: ['Z.......', '......Z.', '..Z.....', '.......Z'],
  stopwatch: [
    '...GG...',
    '..KKKK..',
    '.KWWWWK.',
    'KWWWKWWK',
    'KWWWKWWK',
    'KWWWKKWK',
    'KWWWWWWK',
    '.KWWWWK.',
    '..KKKK..',
  ],
  sparkle: ['.Z.', 'ZWZ', '.Z.'],
  bubble: ['.ZZ.', 'Z..Z', 'Z..Z', '.ZZ.'],
  arrow: [
    '....LLLLLL....',
    '..LLLLLLLLLL..',
    '.LLll....llLL.',
    '.LLl......lLL.',
    'LLl........lLL',
    'LLl...........',
    'LLl.......LLLLL',
    'LLl........LLL.',
    '.LLl........L..',
    '.LLll....l.....',
    '..LLLLLLLL.....',
    '....LLLLL......',
  ].map((r) => r.padEnd(15, '.')),
  halo: ['..CCCCCCCC..', '.C........C.', '..CCCCCCCC..'],
  cape: [
    '......rRRRRRRRRRRRRRRRRRRRRr......',
    '.....rRRRRRRRRRRRRRRRRRRRRRr......',
    '.....rRRRRRRRRRRRRRRRRRRRRRRr.....',
    '....rRRRRRRRRRRRRRRRRRRRRRRRr.....',
    '....rRRRRRRRRRRRRRRRRRRRRRRRRr....',
    '...rRRRRRRRRRRRRRRRRRRRRRRRRRr....',
    '...rRRRRRRRRRRRRRRRRRRRRRRRRRRr...',
    '..rRRRRRRRRRRRRRRRRRRRRRRRRRRRr...',
    '..rRRRRRRRRRRRRRRRRRRRRRRRRRRRRr..',
    '.rRRRRRRRRRRRRRRRRRRRRRRRRRRRRRr..',
    '.rRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRr.',
    'rRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRr.',
    'rRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRr',
    'rRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRr',
    'rRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRr',
    'rRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRr',
    '.r.r.r.r.r.r.r.r.r.r.r.r.r.r.r.r.r',
  ],
  snowflake: ['..Z..', 'Z.Z.Z', '.ZZZ.', 'ZZWZZ', '.ZZZ.', 'Z.Z.Z', '..Z..'],
  sword: [
    '.W.',
    'GWG',
    'GWG',
    'GWG',
    'GWG',
    'GWG',
    'GWG',
    'GWG',
    'GWG',
    'CCCCC'.slice(0, 3),
  ],
  swordGuard: ['CCCCC', '.TTT.'.slice(0, 5), '..T..', '..C..'],
  coffee: ['.Z.Z..', '..Z...', 'WWWWW.', 'WTTTWW', 'WTTTW.W'.slice(0, 6), 'WTTTWW', '.WWW..'],
  receipt: [
    'WWWWWWW',
    'WKKKKKW',
    'WWWWWWW',
    'WKKKWWW',
    'WWWWWWW',
    'WKKKKWW',
    'WWWWWWW',
    'WKKWKKW',
    'WWWWWWW',
    'WLLLLLW',
    'W.W.W.W',
  ],
  flask: ['.KGGK.', '..KZK.', '..KZK.', '.KZZZK', 'KLLLLK', 'KLLLLK', 'KLlLLK', '.KKKK.'],
  bubbles: ['.L..', '...L', 'L...'],
  magnifier: ['.KKKK...', 'KZZZWK..', 'KZZZZK..', 'KZZZZK..', '.KKKKK..', '.....TT.', '......TT', '.......T'],
  bulb: ['Y..YYY..Y', '..YWWWY..', '.YWWWWWY.', '.YWWYWWY.', '.YWWYWWY.', '..YWYWY..', '...GGG...', '...ggg...'],
  zzz: ['ZZZZ', '..Z.', '.Z..', 'ZZZZ', '....', '..ZZ', '...Z', '..ZZ'],
  nightcap: ['..........UU..W', '.......UUUUUUWWW', '....UUUUUUUUU.W.', '..UUUUUUUUUU....', 'WWWWWWWWWWWWW...'],
  sneakerL: ['LLLLLL.', 'LWLWLLL'],
  speedLines: ['WWWW..', '......', '.WWWWW', '......', 'WWW...'],
  heart: ['.LL..LL.', 'LLLLLLLL', 'LqLLLLLL'.replace('q', 'W'), 'LLLLLLLL', '.LLLLLL.', '..LLLL..', '...LL...'],
  map: ['TTTTTTTTT', 'TtTTRTTtT', 'TTT.TRRTT', 'TtTTTRTTT', 'TT.TTTTtT', 'TTTT.TTTT', 'TTTTTTTTT'],
  compass: ['..CCCC..', '.CWWWWC.', 'CWWRWWWC', 'CWWRKWWC', 'CWWGKWWC', 'CWWWGWWC', '.CWWWWC.', '..CCCC..'],
  files: ['.WWWWWWW.', 'TTTTTTTTT', 'TWKKKKWWT', 'TTTTTTTTT', 'TWWKKKKWT', 'TTTTTTTTT', 'TWKKKWWWT', 'TTTTTTTTT', 'ttttttttt'],
  umbrella: [
    '........uUUUUu........',
    '.....uUUUUUUUUUUu.....',
    '...UUUUUUUUUUUUUUUU...',
    '..UUUUUUUUUUUUUUUUUU..',
    '.UUUUUUUUUUUUUUUUUUUU.',
    'UuuUUuuUUUuuUUUuuUUuuU',
    '..........GG..........',
  ],
  rain: ['Z...........Z', '.....Z.......', '..Z.......Z..', '.............', 'Z.....Z.....Z'],
  cloud: [
    '.....WWW.......',
    '...WWWWWWW.WW..',
    '..WWWWWWWWWWWW.',
    '.WWWWWWWWWWWWWW',
    'GWWWWWWWWWWWWWG',
    'GGGGGGGGGGGGGGG',
    '.ggggggggggggg.',
    '...Z...Z...Z...',
    '..Z...Z...Z....',
    '...............',
    '.Z...Z...Z.....',
  ],
  tear: ['Z', 'Z', 'ZZ'],
  couch: [
    '..PPPPPPPPPPPPPPPPPPPPPPPP..',
    '.PPPPPPPPPPPPPPPPPPPPPPPPPP.',
    'pPPPPPPPPPPPPPPPPPPPPPPPPPPp',
    'pPPPPPPPPPPPPPPPPPPPPPPPPPPp',
    'pPPPPPPPPPPPPPPPPPPPPPPPPPPp',
    'pPPPPPPPPPPPPPPPPPPPPPPPPPPp',
    'pppPPPPPPPPPPPPPPPPPPPPPPppp',
    'pppPPPPPPPPPPPPPPPPPPPPPPppp',
    'pppppppppppppppppppppppppppp',
    '.TT......................TT.',
  ],
  siren: ['..Z.Z.Z..', '.Z.....Z.', '...RRR...', '..RRWRR..', '..RRRRR..', '.GGGGGGG.'],
  spotlight: [
    '...............7777...............',
    '..............777777..............',
    '..............777777..............',
    '.............77777777.............',
    '.............77777777.............',
    '............7777777777............',
    '............7777777777............',
    '...........777777777777...........',
    '...........777777777777...........',
    '..........77777777777777..........',
    '..........77777777777777..........',
    '.........7777777777777777.........',
    '.........7777777777777777.........',
    '........777777777777777777........',
    '........777777777777777777........',
    '.......77777777777777777777.......',
    '.......77777777777777777777.......',
    '......7777777777777777777777......',
    '......7777777777777777777777......',
    '.....777777777777777777777777.....',
    '.....777777777777777777777777.....',
    '....77777777777777777777777777....',
    '....77777777777777777777777777....',
    '...7777777777777777777777777777...',
    '...7777777777777777777777777777...',
    '..777777777777777777777777777777..',
    '..777777777777777777777777777777..',
    '.77777777777777777777777777777777.',
    '.77777777777777777777777777777777.',
    '7777777777777777777777777777777777',
  ],
  rat: ['......GG..', '..GGGGGGG.', '.GGGGGGGKG', 'PgGGGGGGGG', '..P..g..g.'],
  record: ['...KKKK...', '.KKgKKgKK.', 'KKgKKKKgKK', 'KgKKRRKKgK', 'KKKRWWRKKK', 'KKKRWWRKKK', 'KgKKRRKKgK', 'KKgKKKKgKK', '.KKgKKgKK.', '...KKKK...'],
  question: ['.nnnn.', 'nn..nn', '....nn', '...nn.', '..nn..', '..nn..', '......', '..nn..'],
};

const FLASH = (g: Grid, at: [number, number][]) => at.forEach(([x, y]) => stamp(g, S.sparkle, x, y));

// ------------------------------------------------------------------ trophies

interface Art {
  tier: Tier;
  /** Draws the scene; `back` runs before the penguin, `front` after. */
  back?: (g: Grid) => void;
  penguin?: { dx?: number; dy?: number; eyes?: keyof typeof EYES };
  front?: (g: Grid) => void;
}

const lifting = (g: Grid) => {
  stamp(g, S.dumbbell, P_X - 3, P_Y + 13);
  stamp(g, S.dumbbell, P_X + 22, P_Y + 13);
};

export const TROPHY_ART: Record<string, Art> = {
  // Consistency
  first_rep: { tier: 'bronze', front: lifting },
  regular: { tier: 'bronze', front: (g) => (lifting(g), FLASH(g, [[7, 9]])) },
  gym_rat: {
    tier: 'silver',
    back: (g) => stamp(g, S.ratTail, P_X + 23, P_Y + 18),
    front: (g) => (stamp(g, S.ratEars, P_X + 4, P_Y), lifting(g)),
  },
  centurion: { tier: 'gold', penguin: { dy: 1 }, front: (g) => stamp(g, S.helmet, P_X + 4, P_Y - 3) },
  on_fire: { tier: 'bronze', back: (g) => stamp(g, S.fire, P_X + 1, P_Y - 5) },
  unbreakable: { tier: 'silver', front: (g) => stamp(g, S.chain, 7, P_Y + 16) },
  legend: { tier: 'gold', penguin: { dy: 1 }, front: (g) => stamp(g, S.crown, P_X + 6, P_Y - 3) },
  perfect_week: { tier: 'silver', front: (g) => stamp(g, S.calendar, P_X + 18, P_Y + 13) },
  early_bird: { tier: 'bronze', back: (g) => stamp(g, S.sun, 6, 6) },
  night_owl: { tier: 'bronze', back: (g) => (stamp(g, S.moon, 8, 7), stamp(g, S.stars, 27, 6)) },
  long_haul: { tier: 'silver', front: (g) => stamp(g, S.stopwatch, P_X + 18, P_Y + 13) },

  // Accountability
  clean_month: {
    tier: 'gold',
    front: (g) => {
      stamp(g, S.bubble, 7, 12);
      stamp(g, S.bubble, 32, 9);
      stamp(g, S.bubble, 33, 26);
      FLASH(g, [[8, 26], [30, 5]]);
    },
  },
  comeback_kid: { tier: 'bronze', penguin: { dx: -3 }, back: (g) => stamp(g, S.arrow, 25, 7) },
  redeemed: { tier: 'bronze', penguin: { dy: 1 }, front: (g) => stamp(g, S.halo, P_X + 6, P_Y - 3) },
  redemption_arc: { tier: 'gold', back: (g) => stamp(g, S.cape, P_X - 5, P_Y + 9) },
  ice_cold: { tier: 'silver', front: (g) => (stamp(g, S.snowflake, 6, 10), stamp(g, S.snowflake, 32, 14)) },

  // Lab
  weak_spot_slayer: {
    tier: 'lab',
    front: (g) => {
      stamp(g, S.sword.slice(0, 9), P_X + 22, P_Y + 2);
      stamp(g, S.swordGuard, P_X + 21, P_Y + 11);
    },
  },
  tired_but_went: {
    tier: 'lab',
    penguin: { eyes: 'tired' },
    front: (g) => (stamp(g, S.coffee, P_X + 19, P_Y + 15), stamp(g, S.dumbbell, P_X - 3, P_Y + 13)),
  },
  scientist: {
    tier: 'lab',
    front: (g) => (stamp(g, S.flask, P_X + 18, P_Y + 13), stamp(g, S.bubbles, P_X + 19, P_Y + 9)),
  },
  peer_reviewed: { tier: 'lab', front: (g) => stamp(g, S.magnifier, P_X + 17, P_Y + 12) },
  eureka: { tier: 'lab', penguin: { dy: 2 }, front: (g) => stamp(g, S.bulb, P_X + 7, P_Y - 6) },
  receipts: { tier: 'lab', front: (g) => stamp(g, S.receipt, P_X + 19, P_Y + 11) },

  // Health
  well_rested: {
    tier: 'silver',
    penguin: { eyes: 'sleepy' },
    front: (g) => (stamp(g, S.nightcap, P_X + 4, P_Y - 2), stamp(g, S.zzz, P_X + 23, P_Y - 3)),
  },
  step_machine: {
    tier: 'silver',
    back: (g) => stamp(g, S.speedLines, 5, P_Y + 15),
    front: (g) => {
      stamp(g, S.sneakerL, P_X + 4, P_Y + 23);
      stamp(g, flipH(S.sneakerL), P_X + 13, P_Y + 23);
    },
  },
  in_the_green: { tier: 'silver', front: (g) => stamp(g, S.heart, P_X + 19, P_Y + 12) },

  // Journeys
  wanderer: { tier: 'bronze', front: (g) => stamp(g, S.map, P_X + 18, P_Y + 13) },
  explorer: { tier: 'gold', front: (g) => stamp(g, S.compass, P_X + 19, P_Y + 13) },

  // Hall of shame
  excuse_collector: { tier: 'shame', front: (g) => stamp(g, S.files, P_X + 17, P_Y + 13) },
  weatherman: {
    tier: 'shame',
    back: (g) => stamp(g, S.rain, P_X + 5, P_Y - 4),
    penguin: { dy: 3 },
    front: (g) => stamp(g, S.umbrella, P_X + 1, P_Y - 3),
  },
  forever_alone: {
    tier: 'shame',
    penguin: { dy: 6, eyes: 'sad' },
    // The cloud sits above him (behind, so the medal clip can't cut it) and rains on him.
    back: (g) => stamp(g, S.cloud, P_X + 4, P_Y - 3),
    front: (g) => stamp(g, S.tear, P_X + 7, P_Y + 19),
  },
  serial_skipper: { tier: 'shame', back: (g) => stamp(g, S.couch, 8, P_Y + 13), penguin: { dy: -3 } },
  caught_red_handed: { tier: 'shame', penguin: { dy: 2 }, front: (g) => stamp(g, S.siren, P_X + 7, P_Y - 4) },
  main_character: {
    tier: 'shame',
    back: (g) => stamp(g, S.spotlight, 5, 3),
    front: (g) => FLASH(g, [[9, 12], [32, 16]]),
  },
  lab_rat_escaped: {
    tier: 'shame',
    penguin: { dx: 3 },
    front: (g) => stamp(g, flipH(S.rat), P_X - 4, P_Y + 18),
  },
  broken_record: {
    tier: 'shame',
    front: (g) => {
      stamp(g, S.record, P_X + 17, P_Y + 12);
      for (const [x, y] of [[P_X + 21, P_Y + 12], [P_X + 22, P_Y + 14], [P_X + 21, P_Y + 16]]) g[y][x] = 'W';
    },
  },
};

/**
 * Compose one trophy. Locked trophies are a silhouette of the same scene, so
 * you can see roughly what you're chasing. Hidden ones show only a question
 * mark until earned.
 */
export function composeTrophy(id: string, state: 'unlocked' | 'locked' | 'secret'): string[] {
  const art = TROPHY_ART[id];
  const tier: Tier | 'locked' = state === 'unlocked' ? art?.tier ?? 'bronze' : 'locked';
  const g = medal(tier);
  if (state === 'secret') {
    stamp(g, S.question.map((r) => r.replace(/n/g, 'n')), SIZE / 2 - 3, SIZE / 2 - 4);
    return g.map((r) => r.join(''));
  }

  const scene = blank();
  art?.back?.(scene);
  drawPenguin(scene, art?.penguin?.dx, art?.penguin?.dy, art?.penguin?.eyes);
  art?.front?.(scene);

  // Clip the scene to the medal interior so props never cross the rim.
  const inner = TIER_STYLE[tier].bg;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (scene[y][x] === '.' || g[y][x] !== inner) continue;
      g[y][x] = state === 'locked' ? 'n' : scene[y][x];
    }
  return g.map((r) => r.join(''));
}

/**
 * Run-length path data, one SVG path per colour. Grouped by colour rather than
 * palette key, since several keys share a colour (gold and flame core).
 */
export function toPaths(grid: string[]): { color: string; d: string }[] {
  const byColor = new Map<string, string[]>();
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      const color = PALETTE[ch];
      let end = x + 1;
      while (end < row.length && PALETTE[row[end]] === color && row[end] !== '.') end++;
      if (ch !== '.') {
        const key = color ?? '#ff00ff';
        const list = byColor.get(key) ?? [];
        // Each run overlaps its neighbours by a hair so anti-aliasing can't
        // open hairline seams between pixels.
        list.push(`M${x} ${y}h${end - x + 0.06}v1.06h${x - end - 0.06}z`);
        byColor.set(key, list);
      }
      x = end;
    }
  });
  return [...byColor.entries()].map(([color, parts]) => ({ color, d: parts.join('') }));
}

/**
 * A trophy's scene without the medal, cropped to its content: for big hero
 * moments like the workout-complete screen, where a frame would feel boxed in.
 */
export function composeScene(id: string): string[] {
  const art = TROPHY_ART[id];
  const scene = blank();
  art?.back?.(scene);
  drawPenguin(scene, art?.penguin?.dx, art?.penguin?.dy, art?.penguin?.eyes);
  art?.front?.(scene);
  const rows = scene.map((r) => r.join(''));
  const used = rows.map((r, y) => (/[^.]/.test(r) ? y : -1)).filter((y) => y >= 0);
  const cols = [...Array(SIZE).keys()].filter((x) => rows.some((r) => r[x] !== '.'));
  const [y0, y1, x0, x1] = [used[0], used[used.length - 1], cols[0], cols[cols.length - 1]];
  return rows.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
}

// ------------------------------------------------------------------ power-up

/**
 * The workout-complete hero: the penguin powered up. An energy aura generated
 * from his own silhouette (so it hugs his shape), a swept flame crest, white-hot
 * eyes and crackling sparks. Two frames that alternate make the aura flicker.
 */
export const POWER_W = 48;
export const POWER_H = 58;
/** Aura animation frames; cycling them fast makes the flames stream upward. */
export const POWER_FRAMES = 4;

const POWER_PALETTE: Record<string, string> = {
  '@': '#00CFFF', // spark cyan
  '!': '#E6FBFF', // spark core
  '%': '#FFF6C2', // aura inner glow
  '&': '#FFB800', // aura outer
  '$': '#FFE45C', // aura mid
  '~': '#B8862A', // rim light on his body from the aura's glow
};
Object.assign(PALETTE, POWER_PALETTE);


const PX = 12;
const PY = 28;

type PGrid = string[][];
const newGrid = (): PGrid => Array.from({ length: POWER_H }, () => Array(POWER_W).fill('.'));
const putOn = (g: PGrid, sprite: string[], ox: number, oy: number) =>
  sprite.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const gy = oy + y;
      const gx = ox + x;
      if (ch !== '.' && gy >= 0 && gy < POWER_H && gx >= 0 && gx < POWER_W) g[gy][gx] = ch;
    })
  );

/** White-hot eyes: the flame shape stays, burning gold and white. */
const hotEyes = (g: PGrid) => {
  for (let y = 0; y < 7; y++)
    for (const ex of [PX + 5, PX + 13])
      for (let x = 0; x < 6; x++) {
        const cell = g[PY + 6 + y][ex + x];
        if (cell === 'F') g[PY + 6 + y][ex + x] = '&';
        else if (cell === 'j') g[PY + 6 + y][ex + x] = 'Y';
        else if (cell === 'Y') g[PY + 6 + y][ex + x] = 'W';
      }
};

/** The plain penguin on the power-up canvas, for the charging phase. */
export function composeCharging(): string[] {
  const g = newGrid();
  putOn(g, PENGUIN, PX, PY);
  return g.map((r) => r.join(''));
}

/**
 * One frame of the powered-up penguin. The aura is grown from his silhouette:
 * a tight glow around the body plus flame tongues rising off it. Each frame
 * shifts the tongues' phase upward and lifts detached embers higher, so
 * cycling frames 0→3 reads as flames streaming up, not a flicker.
 */
export function composePowerUp(frame: number): string[] {
  const g = newGrid();

  // A full-body flame: an egg around him (tall above, rounded below) whose
  // top edge breaks into tongues. The tongue pattern travels with the frame,
  // so cycling frames makes the flames stream upward.
  const cx = PX + 12;
  const cy = PY + 10;
  const rx = 19;
  const ryTop = 19;
  const ryBottom = 16;
  const phase = (frame / POWER_FRAMES) * Math.PI * 2;
  const tongue = (x: number) => {
    const w = Math.sin(x * 0.9 - phase) + 0.6 * Math.sin(x * 2.3 - phase * 2);
    const spike = (x + frame) % 3 === 0 ? 3 : 0;
    return Math.max(0, w * 3 + spike);
  };
  for (let x = 0; x < POWER_W; x++) {
    const nx = (x - cx) / rx;
    if (Math.abs(nx) > 1) continue;
    const span = Math.sqrt(1 - nx * nx);
    const top = Math.round(cy - ryTop * span - tongue(x) * span);
    const bottom = Math.round(cy + ryBottom * span);
    for (let y = Math.max(0, top); y <= Math.min(POWER_H - 1, bottom); y++) {
      const depth = Math.min((1 - Math.abs(nx)) * rx, y - top, bottom - y);
      g[y][x] = depth < 1.5 ? '&' : depth < 3.5 ? '$' : '%';
    }
    // Detached embers riding up above the flame.
    const emberY = top - 3 - ((frame * 3 + x * 7) % 8);
    if (x % 3 === frame % 3 && emberY >= 0) g[emberY][x] = '$';
  }

  putOn(g, PENGUIN, PX, PY);
  hotEyes(g);
  // Golden rim light: the dark body pixels just inside his outline catch the
  // aura's glow, so he looks lit by his own power.
  const body = new Set(['B', 'b']);
  const rim: [number, number][] = [];
  for (let y = PY; y < PY + PENGUIN.length; y++)
    for (let x = PX; x < PX + PENGUIN[0].length; x++) {
      if (!body.has(g[y][x])) continue;
      const nearOutline = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] === 'K');
      if (nearOutline) rim.push([x, y]);
    }
  rim.forEach(([x, y]) => (g[y][x] = '~'));
  return g.map((r) => r.join(''));
}

/** Lightning bolts that snap on and off around him, drawn as separate layers. */
export const POWER_BOLTS: { sprite: string[]; x: number; y: number }[] = [
  { sprite: ['...@', '..@.', '.@!.', '@@@.', '.!@.', '.@..', '@...'], x: 4, y: 30 },
  { sprite: ['@...', '.@..', '.!@.', '.@@@', '.@!.', '..@.', '...@'], x: 40, y: 26 },
  { sprite: ['..@', '.@.', '@!.', '.@@', '..@'], x: 8, y: 12 },
  { sprite: ['@..', '.@.', '.!@', '@@.', '@..'], x: 37, y: 14 },
];
