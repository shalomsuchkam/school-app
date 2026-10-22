import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Btn, Chip, Empty, Field, Group, haptic, Icon, Row, Sheet, Txt } from '@/components/ui';
import { duration } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { filterApps } from '@/lib/screenTime';
import { space, usePalette } from '@/lib/theme';

const PRESETS = [15, 30, 60, 90, 120, 180];

/** Minutes as preset chips plus −/+ 15 for anything else (1..1440, as the server accepts). */
export function MinutesPicker({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  const p = usePalette();
  const t = useT();
  const step = (d: number) => {
    const next = Math.min(1440, Math.max(15, value + d));
    if (next === value) return haptic.warn();
    haptic.tap();
    onChange(next);
  };
  const btn = (d: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(d < 0 ? 'screen.min.less' : 'screen.min.more')}
      hitSlop={8}
      onPress={() => step(d)}
      style={[styles.step, { backgroundColor: p.fill }]}
    >
      <Icon name={d < 0 ? 'remove' : 'add'} size={18} color={p.ink2} />
    </Pressable>
  );
  return (
    <View style={{ gap: space.s }}>
      <View style={styles.wrap}>
        {PRESETS.map((m) => (
          <Chip key={m} label={duration(m)} selected={value === m} onPress={() => onChange(m)} />
        ))}
      </View>
      <View style={styles.stepRow}>
        {btn(-15)}
        <Txt v="headline" style={{ minWidth: 96, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {duration(value)}
        </Txt>
        {btn(15)}
      </View>
    </View>
  );
}

type App = { pkg: string; name: string };

/**
 * Bottom sheet listing the apps the child's phone reported, with search and today's usage.
 * With `minutes` the pick moves to a second step that asks for a time limit.
 */
export function AppPicker({
  visible,
  title,
  apps,
  usage,
  exclude,
  minutes,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  apps: App[];
  usage: Record<string, number>;
  exclude?: string[];
  minutes?: boolean;
  onClose: () => void;
  onPick: (app: App, minutes?: number) => void;
}) {
  const p = usePalette();
  const t = useT();
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<App | null>(null);
  const [mins, setMins] = useState(60);
  const close = () => {
    setQ('');
    setChosen(null);
    onClose();
  };
  const list = filterApps(apps, q, usage, exclude).slice(0, 80);
  const pick = (a: App) => {
    if (minutes) {
      setChosen(a);
      setMins(60);
      return;
    }
    setQ('');
    onPick(a);
  };
  return (
    <Sheet visible={visible} title={chosen ? chosen.name : title} onClose={close}>
      {chosen ? (
        <View style={{ gap: space.m }}>
          <Txt v="callout" color={p.muted}>
            {t('screen.limit.ask')}
          </Txt>
          <MinutesPicker value={mins} onChange={setMins} />
          <Btn
            title={t('common.save')}
            onPress={() => {
              const a = chosen;
              setChosen(null);
              setQ('');
              onPick(a, mins);
            }}
          />
          <Btn title={t('common.back')} kind="ghost" onPress={() => setChosen(null)} />
        </View>
      ) : (
        <>
          <Field value={q} onChangeText={setQ} placeholder={t('screen.picker.search')} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
          {!apps.length ? (
            <Empty icon="phone-portrait-outline" title={t('screen.picker.none')} text={t('screen.picker.noneText')} />
          ) : !list.length ? (
            <Empty icon="search-outline" title={t('screen.picker.nothing')} />
          ) : (
            <Group>
              {list.map((a) => (
                <Row
                  key={a.pkg}
                  icon="apps"
                  title={a.name}
                  subtitle={usage[a.pkg] ? t('screen.usage.today', { dur: duration(usage[a.pkg]) }) : a.pkg}
                  onPress={() => pick(a)}
                  chevron={!!minutes}
                />
              ))}
            </Group>
          )}
          <View style={{ height: space.m }} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s },
  step: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
