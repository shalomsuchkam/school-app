import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Clipboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Badge, Banner, Btn, Card, Chip, Empty, ErrorBanner, Field, Group, haptic, Icon, IconBtn, Loading, Row, Screen, SectionLabel, Txt, useToast } from '@/components/ui';
import { api, type Child, type Overview, type Setup } from '@/lib/api';
import { useIsViewer } from '@/lib/auth';
import { BILIM_URL, normName, parseBilim, parsePasted, planImport, READ_DIARY_JS, readMessage, type BcItem, type Mapping } from '@/lib/bilimclass';
import { ChildSwitcher, currentChildReady, getCurrentChild, setCurrentChild, useCurrentChild } from '@/lib/currentChild';
import { longDate } from '@/lib/format';
import { tn, useT } from '@/lib/i18n';
import { storage } from '@/lib/storage';
import { hairline, radius, space, usePalette } from '@/lib/theme';

type Step = 'intro' | 'web' | 'failed' | 'paste' | 'preview' | 'done';
const MAP_KEY = 'uroki.bilimMap';
const NOTE_MAX = 300;

// BilimClass import (beta). The parent signs in on the real site; only the diary JSON comes back to the app,
// the mapping of subject names is remembered on this phone, and only confirmed homework text is saved as notes.
export default function BilimImport() {
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [step, setStep] = useState<Step>('intro');
  const [consent, setConsent] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [kids, setKids] = useState<Child[]>([]);
  const [childId] = useCurrentChild(kids);
  const [tz, setTz] = useState('Asia/Almaty');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BcItem[]>([]);
  const [map, setMap] = useState<Mapping>({});
  // per-item manual choice in this preview (index → subject id); also remembered by name when the name is known
  const [pick, setPick] = useState<Record<number, number | null>>({});
  const [reading, setReading] = useState(false);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: string[]; skipped: string[] } | null>(null);
  const web = useRef<WebView>(null);
  const viewer = useIsViewer();

  const load = useCallback(async () => {
    try {
      const cid = await currentChildReady();
      const [s, o, me, saved] = await Promise.all([api.setup(cid ?? undefined), api.overview(cid ?? undefined), api.me(), storage.get(MAP_KEY).catch(() => null)]);
      if (getCurrentChild() !== cid) return;
      setSetup(s);
      setOv(o);
      setKids(me.children);
      setTz(me.family.tz);
      try {
        const m = saved ? (JSON.parse(saved) as Mapping) : {};
        if (m && typeof m === 'object') setMap(m);
      } catch {}
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  if (viewer) return <Redirect href="/parent" />;
  if (!setup || !ov) return <Loading error={error} onRetry={load} />;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/parent/settings'));
  const active = ov.days.find((d) => d.date === ov.active);
  const tasks = active?.tasks ?? [];
  const plans = planImport(items, ov.active, setup.subjects, tasks, map).map((pl, i) => {
    const chosen = pick[i];
    if (chosen === undefined) return pl;
    const name = setup.subjects.find((s) => s.id === chosen)?.name;
    const task = name ? tasks.find((x) => x.kind === 'lesson' && normName(x.label) === normName(name)) : undefined;
    return { ...pl, subjectId: chosen, taskId: task?.id ?? null };
  });
  const otherDates = items.filter((x) => x.date !== ov.active).length;
  const ready = plans.filter((x) => x.taskId !== null);

  const onMessage = (e: WebViewMessageEvent) => {
    const m = readMessage(e.nativeEvent.data);
    if (!m) return;
    setReading(false);
    if (m.type === 'need_login') return toast.show(t('parent.bc.needLogin'));
    if (m.type === 'error') return setStep('failed');
    const got = parseBilim(m.payloads, tz);
    if (!got.length) return setStep('failed');
    setItems(got);
    setPick({});
    setStep('preview');
  };
  const read = () => {
    haptic.tap();
    setReading(true);
    web.current?.injectJavaScript(READ_DIARY_JS);
    // the page may never answer (blocked script, navigation): give up after a while
    setTimeout(() => setReading(false), 20000);
  };
  const fromClipboard = async () => {
    try {
      const text = await Clipboard.getString();
      if (text.trim()) setPaste(text.slice(0, 4000));
      else toast.show(t('parent.task.pasteEmpty'));
    } catch {
      toast.show(t('parent.task.pasteEmpty'));
    }
  };
  const parsePaste = () => {
    const list = parsePasted(paste).map((x) => ({ date: ov.active, subject: x.subject, homework: x.homework }));
    if (!list.length) return;
    setItems(list);
    setPick({});
    setStep('preview');
  };
  const choose = (i: number, subject: string, id: number) => {
    setPick({ ...pick, [i]: id });
    const key = normName(subject);
    if (!key) return;
    const next = { ...map, [key]: id };
    setMap(next);
    storage.set(MAP_KEY, JSON.stringify(next)).catch(() => {});
  };
  const confirm = async () => {
    setBusy(true);
    const ok: string[] = [];
    const skipped: string[] = [];
    for (const pl of plans) {
      const label = pl.item.subject || t('parent.bc.noSubject');
      if (pl.taskId === null) {
        skipped.push(label);
        continue;
      }
      try {
        await api.parentNote(pl.taskId, pl.item.homework.slice(0, NOTE_MAX));
        ok.push(label);
      } catch (e) {
        skipped.push(`${label} (${(e as Error).message})`);
      }
    }
    setBusy(false);
    setResult({ ok, skipped });
    setStep('done');
  };
  const switchChild = (id: number | null) => {
    if (id === null || id === setup.child_id) return;
    setCurrentChild(id);
    setPick({});
    setSetup(null);
    load();
  };

  // ---------- the real BilimClass site, in-app ----------
  if (step === 'web' && Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
        <View style={[styles.webBar, { borderColor: p.line, backgroundColor: p.bgElevated }]}>
          <IconBtn icon="close" label={t('common.close')} onPress={() => setStep('intro')} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="headline" numberOfLines={1}>
              bilimclass.kz
            </Txt>
            <View style={styles.lock}>
              <Icon name="lock-closed" size={12} color={p.ok} />
              <Txt v="sub" color={p.muted} numberOfLines={1}>
                {t('parent.bc.webHint')}
              </Txt>
            </View>
          </View>
        </View>
        <WebView
          ref={web}
          source={{ uri: BILIM_URL }}
          onMessage={onMessage}
          // the page keeps its own session in its own storage; nothing is shared with the app
          incognito={false}
          sharedCookiesEnabled={false}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          style={{ flex: 1, backgroundColor: p.bg }}
        />
        <View style={[styles.webFoot, { paddingBottom: insets.bottom + space.s, borderColor: p.line, backgroundColor: p.bgElevated }]}>
          <Btn title={reading ? t('parent.bc.reading') : t('parent.bc.read')} icon="download-outline" loading={reading} onPress={read} />
        </View>
        {toast.node}
      </View>
    );
  }

  return (
    <Screen title={t('parent.bc.title')} subtitle={t('parent.bc.beta')} right={<IconBtn icon="close" label={t('common.close')} onPress={back} />} footer={toast.node}>
      <ChildSwitcher list={kids} value={childId} onChange={switchChild} />
      <ErrorBanner error={error} onRetry={load} />

      {step === 'intro' || (step === 'web' && Platform.OS === 'web') ? (
        <>
          <Card style={{ gap: space.s }}>
            <Txt v="callout">{t('parent.bc.intro')}</Txt>
            {(['parent.bc.how1', 'parent.bc.how2', 'parent.bc.how3'] as const).map((k, i) => (
              <View key={k} style={styles.how}>
                <View style={[styles.num, { backgroundColor: p.brandSoft }]}>
                  <Txt v="sub" color={p.brand} style={{ fontWeight: '700' }}>
                    {i + 1}
                  </Txt>
                </View>
                <Txt v="callout" color={p.ink2} style={{ flex: 1 }}>
                  {t(k)}
                </Txt>
              </View>
            ))}
          </Card>
          <Banner tone="ok" icon="shield-checkmark-outline" text={t('parent.bc.privacy')} />
          <Pressable
            onPress={() => {
              haptic.tap();
              setConsent(!consent);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            style={[styles.consent, { borderColor: consent ? p.brand : p.line, backgroundColor: p.card }]}
          >
            <View style={[styles.box, { borderColor: consent ? p.brandFill : p.border, backgroundColor: consent ? p.brandFill : 'transparent' }]}>
              {consent ? <Icon name="checkmark" size={16} color="#fff" /> : null}
            </View>
            <Txt v="callout" style={{ flex: 1 }}>
              {t('parent.bc.consent')}
            </Txt>
          </Pressable>
          {step === 'web' && Platform.OS === 'web' ? <Banner tone="warn" icon="phone-portrait-outline" text={t('parent.bc.phoneOnly')} /> : null}
          <Btn title={t('parent.bc.start')} icon="open-outline" disabled={!consent} onPress={() => setStep('web')} style={{ marginTop: space.m }} />
          <Btn title={t('parent.bc.paste')} kind="ghost" icon="clipboard-outline" onPress={() => setStep('paste')} style={{ marginTop: space.xs }} />
        </>
      ) : null}

      {step === 'failed' ? (
        <Card>
          <Empty icon="document-text-outline" title={t('parent.bc.fail')} text={t('parent.bc.failText')}>
            <Btn title={t('parent.bc.paste')} icon="clipboard-outline" onPress={() => setStep('paste')} style={{ marginTop: space.m, alignSelf: 'stretch' }} />
            <Btn title={t('common.retry')} kind="ghost" icon="refresh" onPress={() => setStep('web')} style={{ marginTop: space.xs, alignSelf: 'stretch' }} />
          </Empty>
        </Card>
      ) : null}

      {step === 'paste' ? (
        <>
          <Txt v="callout" color={p.muted} style={{ marginBottom: space.s }}>
            {t('parent.bc.pasteHint', { date: longDate(ov.active) })}
          </Txt>
          <Field value={paste} onChangeText={setPaste} placeholder={t('parent.bc.pastePh')} multiline maxLength={4000} style={{ minHeight: 140, textAlignVertical: 'top' }} />
          <View style={styles.row}>
            <Btn small kind="secondary" icon="clipboard-outline" title={t('parent.bc.pasteFrom')} onPress={fromClipboard} />
          </View>
          <Btn title={t('parent.bc.parse')} icon="arrow-forward" disabled={!paste.trim()} onPress={parsePaste} style={{ marginTop: space.m }} />
          <Btn title={t('common.back')} kind="ghost" onPress={() => setStep('intro')} style={{ marginTop: space.xs }} />
        </>
      ) : null}

      {step === 'preview' ? (
        <>
          <SectionLabel>{t('parent.bc.preview', { date: longDate(ov.active) })}</SectionLabel>
          {!plans.length ? (
            <Card>
              <Empty icon="calendar-outline" title={t('parent.bc.previewEmpty', { date: longDate(ov.active) })} />
            </Card>
          ) : (
            plans.map((pl, i) => (
              <Card key={i} style={styles.item}>
                <View style={styles.itemHead}>
                  <Txt v="headline" style={{ flex: 1 }} numberOfLines={2}>
                    {pl.item.subject || t('parent.bc.noSubject')}
                  </Txt>
                  {pl.taskId !== null ? <Badge tone="ok" icon="checkmark" label={t('parent.bc.willWrite')} /> : <Badge tone={pl.subjectId === null ? 'warn' : 'neutral'} label={pl.subjectId === null ? t('parent.bc.noMatch') : t('parent.bc.noTask')} />}
                </View>
                <Txt v="callout" color={p.ink2} numberOfLines={6} selectable>
                  {pl.item.homework}
                </Txt>
                <Txt v="sub" color={p.muted} style={{ fontWeight: '600' }}>
                  {t('parent.bc.mapTo')}
                </Txt>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
                  {setup.subjects.map((s) => (
                    <Chip key={s.id} label={`${s.emoji} ${s.name}`} selected={pl.subjectId === s.id} onPress={() => choose(i, pl.item.subject, s.id)} />
                  ))}
                </ScrollView>
              </Card>
            ))
          )}
          {otherDates ? (
            <Txt v="sub" color={p.muted} style={{ marginTop: space.xs, marginHorizontal: 6 }}>
              {tn('parent.bc.otherDates', otherDates)}
            </Txt>
          ) : null}
          <Btn title={t('parent.bc.confirm', { n: ready.length })} icon="checkmark" disabled={!ready.length} loading={busy} onPress={confirm} style={{ marginTop: space.m }} />
          <Btn title={t('common.back')} kind="ghost" onPress={() => setStep('intro')} style={{ marginTop: space.xs }} />
        </>
      ) : null}

      {step === 'done' && result ? (
        <>
          <Card tone={result.ok.length ? 'ok' : undefined} style={{ gap: space.xs }}>
            <Txt v="headline">{t('parent.bc.summary', { ok: result.ok.length, skip: result.skipped.length })}</Txt>
            {result.ok.length ? (
              <Txt v="callout" color={p.ink2}>
                {result.ok.join(', ')}
              </Txt>
            ) : null}
          </Card>
          {result.skipped.length ? (
            <>
              <SectionLabel>{t('parent.bc.skipped')}</SectionLabel>
              <Group>
                {result.skipped.map((x, i) => (
                  <Row key={i} icon="remove-circle-outline" title={x} />
                ))}
              </Group>
              <Txt v="sub" color={p.muted} style={{ marginTop: space.xs, marginHorizontal: 6 }}>
                {t('parent.bc.skippedHint')}
              </Txt>
            </>
          ) : null}
          <Btn title={t('parent.bc.toToday')} onPress={() => router.replace('/parent')} style={{ marginTop: space.m }} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  how: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  consent: { flexDirection: 'row', alignItems: 'center', gap: space.s, borderWidth: 1, borderRadius: radius.l, padding: space.m, marginTop: space.s },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  item: { gap: space.xs, marginBottom: space.xs },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  chips: { gap: space.xs, paddingVertical: 2 },
  webBar: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m, paddingVertical: space.xs, borderBottomWidth: hairline },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  webFoot: { paddingHorizontal: space.m, paddingTop: space.s, borderTopWidth: hairline },
});
