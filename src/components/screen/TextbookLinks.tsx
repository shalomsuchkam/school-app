import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Btn, Chip, Field, Group, Row, SectionLabel, Sheet, Txt } from '@/components/ui';
import { api, type Child, type Textbook } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { httpHost, validLink } from '@/lib/screenTime';
import { space, usePalette } from '@/lib/theme';

// Parent: textbook links for one child or for every child. The child opens them in the in-app viewer,
// which stays on the link's own site. Links work even without screen-time rules or a subscription.
export function TextbookLinks({ kids, childId, onToast }: { kids: Child[]; childId: number | null; onToast: (msg: string) => void }) {
  const p = usePalette();
  const t = useT();
  const [list, setList] = useState<Textbook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [forAll, setForAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api.textbooks());
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

  const shown = (list ?? []).filter((b) => b.child_id === null || b.child_id === childId);
  const kidName = (id: number | null) => (id === null ? t('screen.books.forAll') : (kids.find((k) => k.id === id)?.name ?? ''));
  const fixed = url.trim() && !/^https?:\/\//i.test(url.trim()) ? `https://${url.trim()}` : url.trim();
  const ok = title.trim().length > 0 && validLink(fixed);

  const add = async () => {
    setBusy(true);
    try {
      const b = await api.addTextbook({ child_id: forAll && kids.length > 1 ? null : childId, title: title.trim().slice(0, 80), url: fixed });
      setList((cur) => [...(cur ?? []), b]);
      setOpen(false);
      setTitle('');
      setUrl('');
      onToast(t('screen.books.added'));
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = (b: Textbook) =>
    Alert.alert(t('screen.books.deleteTitle'), b.title, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteTextbook(b.id);
            setList((cur) => (cur ?? []).filter((x) => x.id !== b.id));
          } catch (e) {
            onToast((e as Error).message);
          }
        },
      },
    ]);

  return (
    <>
      <SectionLabel>{t('screen.books.section')}</SectionLabel>
      <Group>
        {shown.map((b) => (
          <Row
            key={b.id}
            icon="book"
            tint="violet"
            title={b.title}
            subtitle={`${httpHost(b.url) ?? b.url}${kids.length > 1 ? ` · ${kidName(b.child_id)}` : ''}`}
            right={
              <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel={`${t('common.delete')}: ${b.title}`} onPress={() => remove(b)}>
                <Txt v="sub" color={p.bad} style={{ fontWeight: '600' }}>
                  {t('common.delete')}
                </Txt>
              </Pressable>
            }
          />
        ))}
        <Row icon="add" tint="violet" title={t('screen.books.add')} chevron onPress={() => setOpen(true)} disabled={list === null && !error} />
      </Group>
      <Txt v="sub" color={error ? p.bad : p.muted} style={styles.hint}>
        {error ?? t('screen.books.hint')}
      </Txt>

      <Sheet visible={open} title={t('screen.books.add')} onClose={() => setOpen(false)}>
        <Field label={t('screen.books.title')} value={title} onChangeText={setTitle} placeholder={t('screen.books.titlePh')} maxLength={80} />
        <Field
          label={t('screen.books.url')}
          value={url}
          onChangeText={setUrl}
          placeholder="https://okulyk.kz/…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          maxLength={500}
        />
        {url.trim() && !validLink(fixed) ? (
          <Txt v="sub" color={p.bad} style={{ marginBottom: space.s }}>
            {t('screen.books.badUrl')}
          </Txt>
        ) : null}
        {kids.length > 1 ? (
          <View style={styles.chips}>
            <Chip label={kidName(childId)} selected={!forAll} onPress={() => setForAll(false)} />
            <Chip label={t('screen.books.forAll')} selected={forAll} onPress={() => setForAll(true)} />
          </View>
        ) : null}
        <Btn title={t('common.add')} disabled={!ok} loading={busy} onPress={add} style={{ marginTop: space.s }} />
        <View style={{ height: space.m }} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: space.xs, marginHorizontal: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.s },
});
