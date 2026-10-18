import { memo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { composeScene, composeTrophy, toPaths, SIZE } from '@/constants/trophyArt';

type BadgeState = 'unlocked' | 'locked' | 'secret';

/**
 * Composed art is cached per trophy and state: composing walks a 44x44 grid,
 * and the trophy room renders dozens of badges at once.
 */
const cache = new Map<string, { color: string; d: string }[]>();
const pathsFor = (id: string, state: BadgeState) => {
  const key = `${id}:${state}`;
  let paths = cache.get(key);
  if (!paths) {
    paths = toPaths(composeTrophy(id, state));
    cache.set(key, paths);
  }
  return paths;
};

/** A pixel-art trophy medal. One SVG path per colour keeps it cheap to draw. */
export const PixelBadge = memo(function PixelBadge({
  id,
  state = 'unlocked',
  size = 52,
}: {
  id: string;
  state?: BadgeState;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {pathsFor(id, state).map((p) => (
        <Path key={p.color} d={p.d} fill={p.color} />
      ))}
    </Svg>
  );
});

const sceneCache = new Map<string, { w: number; h: number; paths: { color: string; d: string }[] }>();

/** A trophy scene without its medal (e.g. the flame-aura penguin), sized by width. */
export const PixelScene = memo(function PixelScene({ id, width = 180 }: { id: string; width?: number }) {
  let scene = sceneCache.get(id);
  if (!scene) {
    const grid = composeScene(id);
    scene = { w: grid[0].length, h: grid.length, paths: toPaths(grid) };
    sceneCache.set(id, scene);
  }
  return (
    <Svg width={width} height={(width * scene.h) / scene.w} viewBox={`0 0 ${scene.w} ${scene.h}`}>
      {scene.paths.map((p) => (
        <Path key={p.color} d={p.d} fill={p.color} />
      ))}
    </Svg>
  );
});
