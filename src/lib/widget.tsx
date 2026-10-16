import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { tomorrowWidget, type WidgetData } from '@/widget/TomorrowWidget';

import { isDone, type ChildState } from './api';
import { localIso } from './format';

// Data for the Android home-screen widget. Only the child's screen writes it (after each load) and sign-out clears it.
// It holds what the widget shows and nothing else: no token, no ids, no URLs. Android only: there is no iOS widget
// (it would need a WidgetKit extension with an App Group, which the unsigned, re-signed-by-the-user IPA can't keep).
export const WIDGET_NAME = 'Tomorrow';
const MAX_NAMES = 5;
const enabled = Platform.OS === 'android';
const file = () => new File(Paths.document, 'widget-tomorrow.json');

export function widgetData(s: ChildState): WidgetData {
  const req = s.tasks.filter((x) => x.required);
  const open = req.filter((x) => !isDone(x));
  return {
    school_date: s.school_date,
    done: req.length - open.length,
    total: req.length,
    left: open.slice(0, MAX_NAMES).map((x) => `${x.emoji ? `${x.emoji} ` : ''}${x.label}`.slice(0, 60)),
    left_count: open.length,
  };
}

export async function readWidgetData(): Promise<WidgetData | null> {
  try {
    const f = file();
    if (!f.exists) return null;
    const d = JSON.parse(await f.text()) as WidgetData;
    return typeof d?.school_date === 'string' && Array.isArray(d.left) ? d : null;
  } catch {
    return null;
  }
}

// Redraws every placed widget; a no-op when none is on the home screen.
async function redraw(data: WidgetData | null) {
  await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: (info) => tomorrowWidget(data, localIso(new Date()), info.height) });
}

// Never throws: the widget is a nicety and must not break the child's screen.
export async function syncWidget(s: ChildState) {
  if (!enabled) return;
  try {
    const data = widgetData(s);
    file().write(JSON.stringify(data));
    await redraw(data);
  } catch {}
}

export async function clearWidget() {
  if (!enabled) return;
  try {
    const f = file();
    if (f.exists) f.delete();
    await redraw(null);
  } catch {}
}
