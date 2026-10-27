import Constants from 'expo-constants';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Btn, Card, Group, Icon, IconTile, ToggleRow, Txt } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { iosPicker, iosStatus, requestIosAuthorization, SEL, setIosDenyRemoval, type IosStatus, type SelKey, type SelMeta } from '@/lib/screenGuardIos';
import { space, usePalette } from '@/lib/theme';

/** The iOS screen-time build is out (the flag is the same for the parent's and the child's build). */
export const iosScreenTimeReleased = Constants.expoConfig?.extra?.iosScreenTime === true;

// Apple's picker sheet (null outside flag-on iOS builds; resolved once, not during render)
const Picker = iosPicker();

const chosen = (m: SelMeta) => m.apps + m.categories + m.sites > 0;

/**
 * Child's iPhone (flag-on builds): the parent, holding the child's phone, grants Screen Time permission and picks
 * the three app selections with Apple's picker. `onChange` re-applies the rules (ScreenTimePanel.refresh).
 */
export function IosSetupCard({ onChange }: { onChange: () => void }) {
  const p = usePalette();
  const t = useT();
  const [s, setS] = useState<IosStatus>(() => iosStatus());
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [picking, setPicking] = useState<SelKey | null>(null);

  const reload = useCallback(() => {
    setS(iosStatus());
    onChange();
  }, [onChange]);

  const authorize = async () => {
    setBusy(true);
    const ok = await requestIosAuthorization();
    setBusy(false);
    setDenied(!ok);
    reload();
  };

  const steps: { key: SelKey; title: string; text: string }[] = [
    { key: 'always', title: t('screen.ios.always'), text: t('screen.ios.alwaysText') },
    { key: 'limited', title: t('screen.ios.limited'), text: t('screen.ios.limitedText') },
    { key: 'window', title: t('screen.ios.window'), text: t('screen.ios.windowText') },
  ];
  const ready = s.authorized && chosen(s.sel.always);

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <IconTile icon={ready ? 'hourglass-outline' : 'hourglass'} size={40} />
        <Txt v="headline" style={{ flex: 1 }}>
          {ready ? t('screen.ios.on') : t('screen.child.title')}
        </Txt>
      </View>
      <Txt v="callout" color={p.ink2}>
        {ready ? t('screen.ios.onText') : t('screen.ios.what')}
      </Txt>
      {s.authorized ? null : (
        <>
          <Txt v="sub" color={p.muted}>
            {t('screen.ios.family')}
          </Txt>
          <Step n={1} done={false} title={t('screen.ios.auth')} text={denied || s.denied ? t('screen.ios.denied') : t('screen.ios.authText')} bad={denied || s.denied}>
            <Btn small icon="shield-checkmark" title={t('screen.ios.authBtn')} loading={busy} onPress={authorize} style={styles.stepBtn} />
          </Step>
        </>
      )}
      {s.authorized
        ? steps.map((x, i) => {
            const m = s.sel[x.key];
            const done = chosen(m);
            return (
              <Step key={x.key} n={i + 1} done={done} title={x.title} text={done ? t('screen.ios.count', { apps: m.apps, cats: m.categories }) : x.text}>
                <Btn small kind="secondary" icon="apps" title={done ? t('screen.ios.change') : t('screen.ios.pick')} onPress={() => setPicking(x.key)} style={styles.stepBtn} />
              </Step>
            );
          })
        : null}
      {s.authorized ? (
        <Group>
          <ToggleRow
            icon="trash-outline"
            tint="red"
            title={t('screen.ios.removal')}
            subtitle={t('screen.ios.removalSub')}
            value={s.denyRemoval}
            onChange={(v) => {
              setIosDenyRemoval(v);
              reload();
            }}
          />
        </Group>
      ) : null}
      {Picker && picking ? (
        <Picker
          style={styles.anchor}
          familyActivitySelectionId={SEL[picking]}
          // whitelists ignore categories unless they include every app in them
          includeEntireCategory={picking !== 'limited'}
          headerText={steps.find((x) => x.key === picking)?.title}
          footerText={steps.find((x) => x.key === picking)?.text}
          onSelectionChange={() => setS(iosStatus())}
          onDismissRequest={() => {
            setPicking(null);
            reload();
          }}
        />
      ) : null}
    </Card>
  );
}

function Step({ n, done, title, text, bad, children }: { n: number; done: boolean; title: string; text: string; bad?: boolean; children: ReactNode }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        {done ? (
          <Icon name="checkmark-circle" size={24} color={p.ok} />
        ) : (
          <View style={[styles.num, { backgroundColor: p.brandSoft }]}>
            <Txt v="sub" color={p.brand} style={{ fontWeight: '700' }}>
              {n}
            </Txt>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="headline">{title}</Txt>
          <Txt v="sub" color={bad ? p.bad : done ? p.ok : p.muted} accessibilityLabel={done ? `${t('screen.setup.on')}. ${text}` : undefined}>
            {text}
          </Txt>
        </View>
      </View>
      {children}
    </View>
  );
}

/** Parent screen: how screen time works on a child's iPhone (shown while no Android phone reports). */
export function IosParentCard() {
  const p = usePalette();
  const t = useT();
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <IconTile icon="logo-apple" size={40} tone="neutral" />
        <Txt v="headline" style={{ flex: 1 }}>
          {t('screen.ios.parentTitle')}
        </Txt>
      </View>
      <Txt v="callout" color={p.ink2}>
        {t('screen.ios.parentHow')}
      </Txt>
      <Txt v="callout" color={p.ink2}>
        {t('screen.ios.parentRules')}
      </Txt>
      <Txt v="sub" color={p.muted}>
        {t('screen.ios.parentNot')}
      </Txt>
      <Txt v="sub" color={p.muted}>
        {t('screen.ios.parentFamily')}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.s, marginTop: space.s },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  step: { gap: space.xs },
  stepHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s },
  stepBtn: { alignSelf: 'flex-start', marginLeft: 36 },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // the native sheet presents itself; its anchor view stays invisible
  anchor: { width: 1, height: 1, position: 'absolute' },
});
