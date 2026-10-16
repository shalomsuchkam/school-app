'use no memo'; // widget components are called as plain functions by the widget renderer: no React Compiler hooks

import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { longDate } from '@/lib/format';
import { t, tn } from '@/lib/i18n';
import { palettes, type Palette } from '@/lib/theme';

// Android home-screen widget "tasks for the next school day". It is drawn from WidgetData that the child's
// app saved on its last load (see lib/widget.tsx): no network, no tokens. Tapping anywhere opens the app.
export type WidgetData = {
  school_date: string;
  done: number;
  total: number;
  // names of required tasks still open (first few) and how many are open in total
  left: string[];
  left_count: number;
};

type Hex = `#${string}`;
const hex = (c: string) => c as Hex;

function Line({ text, color, size = 13, bold }: { text: string; color: string; size?: number; bold?: boolean }) {
  return <TextWidget text={text} maxLines={1} truncate="END" style={{ fontSize: size, color: hex(color), fontWeight: bold ? '700' : '400' }} />;
}

function Body({ data, today, height, c }: { data: WidgetData | null; today: string; height: number; c: Palette }) {
  const root = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    backgroundColor: hex(c.card),
    borderRadius: 22,
    padding: 14,
    flexDirection: 'column' as const,
    flexGap: 3,
  };
  if (!data) {
    return (
      <FlexWidget clickAction="OPEN_APP" accessibilityLabel={t('child.widget.empty')} style={{ ...root, justifyContent: 'center' }}>
        <Line text={t('onboarding.welcome.brand')} color={c.brand} size={15} bold />
        <TextWidget text={t('child.widget.empty')} maxLines={3} style={{ fontSize: 13, color: hex(c.muted) }} />
      </FlexWidget>
    );
  }
  const label = longDate(data.school_date);
  const title = label.charAt(0).toUpperCase() + label.slice(1);
  const progress = data.total ? t('child.widget.progress', { done: data.done, total: data.total }) : t('child.widget.noTasks');
  const stale = data.school_date < today;
  // the list shrinks with the widget: header lines take ~60dp, each task ~18dp
  const room = Math.max(1, Math.min(5, Math.floor((height - 64 - (stale ? 18 : 0)) / 18)));
  const shown = data.left.slice(0, data.left_count > room ? room - 1 || 1 : room);
  const more = data.left_count - shown.length;
  return (
    <FlexWidget clickAction="OPEN_APP" accessibilityLabel={`${title}. ${progress}`} style={root}>
      <Line text={t('child.widget.caption')} color={c.muted} size={11} />
      <Line text={title} color={c.ink} size={15} bold />
      <Line text={progress} color={data.total && !data.left_count ? c.ok : c.brand} bold />
      {data.total && !data.left_count ? <Line text={t('child.widget.allDone')} color={c.ok} /> : null}
      {shown.map((name, i) => (
        <Line key={i} text={`• ${name}`} color={c.ink2} />
      ))}
      {more > 0 ? <Line text={tn('child.widget.more', more)} color={c.muted} size={12} /> : null}
      {stale ? <Line text={t('child.widget.stale')} color={c.warn} size={12} /> : null}
    </FlexWidget>
  );
}

// Both schemes: the launcher picks the one matching the system theme.
export function tomorrowWidget(data: WidgetData | null, today: string, height = 200) {
  return {
    light: <Body data={data} today={today} height={height} c={palettes.light} />,
    dark: <Body data={data} today={today} height={height} c={palettes.dark} />,
  };
}
