import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Btn, Chip, EmojiPicker, Empty, Field, Group, Loading, Row, Screen, SectionLabel, Sheet, ToggleRow, Txt, useToast, WeekdayPicker } from '@/components/ui';
import { api, type Family, type Item } from '@/lib/api';
import { weekdaysLabel } from '@/lib/format';
import { EMOJIS, ITEM_PRESETS } from '@/lib/presets';
import { usePalette } from '@/lib/theme';

type Draft = Partial<Item> & { everyDay?: boolean };

export default function Lists() {
  const p = usePalette();
  const [items, setItems] = useState<Item[] | null>(null);
  const [fam, setFam] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const toast = useToast();
  // A delete is held back while its «Вернуть» toast is up, so undo keeps the same item (and its tasks).
  const pending = useRef<{ id: number; timer: ReturnType<typeof setTimeout> } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, me] = await Promise.all([api.setup(), api.me()]);
      setItems(s.items.filter((x) => x.id !== pending.current?.id));
      setFam(me.family);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const flush = useCallback(() => {
    const d = pending.current;
    if (!d) return;
    pending.current = null;
    clearTimeout(d.timer);
    api.deleteItem(d.id).catch(load);
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      load();
      return flush; // leaving the tab (or unmounting) commits a pending delete
    }, [load, flush]),
  );
  if (!items || !fam) return <Loading error={error} onRetry={load} />;

  const openNew = (preset?: (typeof ITEM_PRESETS)[number]) =>
    setDraft({ title: preset?.title ?? '', emoji: preset?.emoji ?? '✅', needs_photo: preset?.needs_photo ?? false, required: preset?.required ?? true, weekdays: null, everyDay: true });
  const save = async () => {
    if (!draft?.title?.trim()) return;
    const body = {
      title: draft.title.trim(),
      emoji: draft.emoji ?? '✅',
      needs_photo: !!draft.needs_photo,
      required: draft.required !== false,
      weekdays: draft.everyDay || !draft.weekdays?.length ? null : draft.weekdays,
    };
    try {
      if (draft.id) await api.updateItem(draft.id, body);
      else await api.addItem({ ...body, pos: items.length });
      setDraft(null);
      load();
    } catch (e) {
      toast.show((e as Error).message);
    }
  };
  const remove = (id: number) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    flush();
    setDraft(null);
    setItems(items.filter((x) => x.id !== id));
    pending.current = { id, timer: setTimeout(flush, 5000) };
    toast.show(`«${it.title}» удалён`, {
      label: 'Вернуть',
      run: () => {
        if (pending.current?.id === id) {
          clearTimeout(pending.current.timer);
          pending.current = null;
        }
        load();
      },
    });
  };
  const unused = ITEM_PRESETS.filter((x) => !items.some((i) => i.title === x.title));

  return (
    <>
      <Screen title="Дела" subtitle="К утру учебного дня" onRefresh={load} right={<Btn small title="Добавить" icon="＋" onPress={() => openNew()} />}>
        {items.length ? (
          <Group>
            {items.map((it) => (
              <Row
                key={it.id}
                icon={it.emoji}
                title={it.title}
                subtitle={`${weekdaysLabel(it.weekdays)} · ${it.needs_photo ? 'с фото' : 'галочкой'}${it.required ? '' : ' · по желанию'}`}
                chevron
                onPress={() => setDraft({ ...it, everyDay: !it.weekdays?.length })}
              />
            ))}
          </Group>
        ) : (
          <Group>
            <Empty icon="🎒" title="Список пуст" text="Добавьте то, что нужно сделать к утру: погладить рубашку, собрать портфель…" />
          </Group>
        )}
        {unused.length ? (
          <>
            <SectionLabel>Быстро добавить</SectionLabel>
            <View style={styles.wrap}>
              {unused.map((x) => (
                <Chip key={x.title} label={`＋ ${x.emoji} ${x.title}`} tone="muted" onPress={() => openNew(x)} />
              ))}
            </View>
          </>
        ) : null}
        <Txt v="sub" color={p.muted} style={{ marginTop: 18, marginHorizontal: 6 }}>
          Пункты с фото ученик подтверждает снимком с камеры. Остальные — галочкой. Пропустить обязательный пункт можно только с вашего одобрения.
        </Txt>
      </Screen>

      <Sheet visible={!!draft} title={draft?.id ? 'Пункт списка' : 'Новый пункт'} onClose={() => setDraft(null)} overlay={toast.node}>
        <Field label="Что сделать" value={draft?.title ?? ''} onChangeText={(title) => setDraft({ ...draft, title })} placeholder="Например, погладить рубашку" maxLength={50} />
        <Txt v="sub" color={p.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
          Значок
        </Txt>
        <EmojiPicker value={draft?.emoji ?? '✅'} options={EMOJIS} onChange={(emoji) => setDraft({ ...draft, emoji })} />
        <Group style={{ marginTop: 14 }}>
          <ToggleRow icon="📸" title="Нужно фото" subtitle="Иначе — просто галочка" value={!!draft?.needs_photo} onChange={(needs_photo) => setDraft({ ...draft, needs_photo })} />
          <ToggleRow icon="❗" title="Обязательно" subtitle="Без него день не засчитается" value={draft?.required !== false} onChange={(required) => setDraft({ ...draft, required })} />
          <ToggleRow icon="🗓️" title="Каждый учебный день" value={!!draft?.everyDay} onChange={(everyDay) => setDraft({ ...draft, everyDay, weekdays: everyDay ? null : draft?.weekdays ?? [] })} />
        </Group>
        {!draft?.everyDay ? (
          <View style={{ marginTop: 12 }}>
            <Txt v="sub" color={p.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
              В какие дни (к утру этого дня)
            </Txt>
            <WeekdayPicker value={draft?.weekdays ?? []} onChange={(weekdays) => setDraft({ ...draft, weekdays })} only={fam.school_weekdays} />
          </View>
        ) : null}
        <Btn title="Сохранить" onPress={save} disabled={!draft?.title?.trim() || (!draft?.everyDay && !draft?.weekdays?.length)} style={{ marginTop: 16 }} />
        {draft?.id ? <Btn title="Удалить" kind="plain" onPress={() => remove(draft.id!)} style={{ marginTop: 10 }} /> : null}
      </Sheet>
      {draft ? null : toast.node}
    </>
  );
}

const styles = StyleSheet.create({ wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
