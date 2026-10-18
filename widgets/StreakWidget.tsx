import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { widgetPenguinSvg } from '@/constants/widgetArt';
import type { WidgetView } from '@/services/widgetMood';

/** Below this (dp) the widget is a 1x1-ish tile: just the penguin and his streak. */
const COMPACT_DP = 120;

/**
 * Home-screen widget, Duolingo-style: the penguin is the whole point. His
 * mood follows your day (services/widgetMood.ts). Tapping him pokes him;
 * tapping anywhere else opens the app. Resizes down to a single tile.
 */
export function StreakWidget({
  view,
  streak,
  width = 160,
  height = 160,
}: {
  view: WidgetView;
  streak: number | null;
  width?: number;
  height?: number;
}) {
  const compact = width < COMPACT_DP || height < COMPACT_DP;
  const powered = view.mood === 'done';
  // The penguin fills most of the tile; the powered form is taller than wide.
  const size = Math.max(40, Math.min(width, height) * (compact ? 0.78 : 0.62));
  const penguin = powered ? { width: size * 0.83, height: size } : { width: size, height: size * 0.97 };

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={`NoWomp. Streak ${streak ?? 0}. ${view.line}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#0B0B0B',
        borderRadius: 22,
        borderWidth: 2,
        borderColor: view.border,
        padding: compact ? 4 : 8,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Streak badge sits above the penguin like a score counter. */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#1A1A1A',
          borderRadius: 10,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}
      >
        <TextWidget
          text={`🔥 ${streak ?? '–'}`}
          style={{ fontSize: compact ? 12 : 14, color: '#A8FF3E', fontWeight: 'bold' }}
        />
      </FlexWidget>

      <FlexWidget clickAction="POKE" accessibilityLabel="Poke the penguin" style={{ marginTop: 2 }}>
        <SvgWidget svg={widgetPenguinSvg(view.mood)} style={penguin} />
      </FlexWidget>

      {!compact && (
        <TextWidget
          text={view.line}
          maxLines={2}
          truncate="END"
          style={{ fontSize: 11, color: '#FFFFFF', textAlign: 'center', fontWeight: 'bold', marginTop: 2 }}
        />
      )}
    </FlexWidget>
  );
}
