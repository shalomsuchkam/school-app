import { buildWidgetTree } from 'react-native-android-widget/lib/commonjs/api/build-widget-tree';

import type { ChildState, Task } from '@/lib/api';
import { setLang, t, tn } from '@/lib/i18n';
import { widgetData } from '@/lib/widget';
import { tomorrowWidget, type WidgetData } from '@/widget/TomorrowWidget';

import { LANGS } from './helpers';

type Node = { type: string; props: Record<string, unknown>; children?: Node[] };
const texts = (n: Node): string[] => [...(typeof n.props.text === 'string' ? [n.props.text] : []), ...(n.children ?? []).flatMap(texts)];

const task = (id: number, label: string, over: Partial<Task> = {}) => ({ id, label, emoji: '📘', required: true, status: 'todo', ...over }) as Task;
const state = (tasks: Task[]) => ({ school_date: '2026-10-19', tasks }) as unknown as ChildState;

afterAll(() => setLang('ru'));

describe('widget data', () => {
  it('counts required tasks only and keeps at most 5 open names, nothing secret', () => {
    const d = widgetData(
      state([
        task(1, 'Математика', { status: 'done' }),
        task(2, 'Физика', { status: 'skip_ok' }),
        ...[3, 4, 5, 6, 7, 8].map((i) => task(i, `Урок ${i}`)),
        task(9, 'Кружок', { required: false }),
      ]),
    );
    expect(d).toEqual({ school_date: '2026-10-19', done: 2, total: 8, left: ['📘 Урок 3', '📘 Урок 4', '📘 Урок 5', '📘 Урок 6', '📘 Урок 7'], left_count: 6 });
    expect(Object.keys(d).sort()).toEqual(['done', 'left', 'left_count', 'school_date', 'total']);
  });
});

describe.each(LANGS)('widget layout (%s)', (lang) => {
  beforeEach(() => setLang(lang));
  const data: WidgetData = { school_date: '2026-10-19', done: 2, total: 8, left: ['📘 A', '📘 B', '📘 C', '📘 D', '📘 E'], left_count: 6 };
  const tree = (d: WidgetData | null, today = '2026-10-18', height = 200) => {
    const w = tomorrowWidget(d, today, height);
    return { light: buildWidgetTree(w.light) as Node, dark: buildWidgetTree(w.dark) as Node };
  };

  it('builds both schemes; the whole widget opens the app', () => {
    const { light, dark } = tree(data);
    for (const n of [light, dark]) expect(n.props).toEqual(expect.objectContaining({ clickAction: 'OPEN_APP' }));
    expect(texts(light)).toEqual(texts(dark));
  });

  it('shows the next school day, progress and the remaining tasks, shrinking with the widget', () => {
    const big = texts(tree(data).light);
    expect(big).toEqual(expect.arrayContaining([t('child.widget.caption'), t('child.widget.progress', { done: 2, total: 8 }), '• 📘 A', tn('child.widget.more', 2)]));
    const small = texts(tree(data, '2026-10-18', 110).light);
    expect(small.filter((s) => s.startsWith('•')).length).toBeLessThan(big.filter((s) => s.startsWith('•')).length);
  });

  it('all done, stale data and the signed-out state', () => {
    expect(texts(tree({ ...data, done: 8, left: [], left_count: 0 }).light)).toContain(t('child.widget.allDone'));
    expect(texts(tree(data, '2026-10-20').light)).toContain(t('child.widget.stale'));
    expect(texts(tree(null).light)).toContain(t('child.widget.empty'));
  });
});
