import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { StreakWidget } from './StreakWidget';
import { WIDGET_NAME, WidgetService } from '@/services/WidgetService';

/** How long the penguin stays annoyed after a poke before settling back. */
const POKE_SHOW_MS = 4000;

/**
 * Runs (possibly headless) when Android asks the widget to draw: when it's
 * added, resized, on its 30-minute refresh, and when the penguin is poked.
 * The mood is recomputed from the stored snapshot and the current time on
 * every draw, which is what lets him get impatient while the app is closed.
 */
export async function widgetTaskHandler({
  widgetInfo,
  widgetAction,
  clickAction,
  renderWidget,
}: WidgetTaskHandlerProps) {
  if (widgetInfo.widgetName !== WIDGET_NAME) return;
  const size = { width: widgetInfo.width, height: widgetInfo.height };
  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      renderWidget(<StreakWidget {...size} {...await WidgetService.currentView()} />);
      break;
    case 'WIDGET_CLICK':
      if (clickAction === 'POKE') {
        renderWidget(<StreakWidget {...size} {...await WidgetService.poke()} />);
        // Then he calms down. If the system ends the task first, the next
        // refresh restores him anyway.
        await new Promise((r) => setTimeout(r, POKE_SHOW_MS));
        renderWidget(<StreakWidget {...size} {...await WidgetService.currentView()} />);
      }
      break;
    default:
      break;
  }
}
