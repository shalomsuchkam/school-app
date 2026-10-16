import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { localIso } from '@/lib/format';
import { initLang } from '@/lib/i18n';
import { readWidgetData } from '@/lib/widget';

import { tomorrowWidget } from './TomorrowWidget';

// Runs headless when Android asks for the widget (placed, resized, periodic update) while the app may be closed.
// It only reads what the app saved: the widget never goes to the network.
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      await initLang(); // the device's chosen language, as in the app
      props.renderWidget(tomorrowWidget(await readWidgetData(), localIso(new Date()), props.widgetInfo.height));
      break;
    }
    default:
      break; // taps use OPEN_APP and never reach here
  }
}
