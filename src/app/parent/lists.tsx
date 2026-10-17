import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Btn, Chip, EmojiPicker, Empty, Field, Group, Loading, Row, Screen, SectionLabel, Sheet, ToggleRow, Txt, useToast, WeekdayPicker } from '@/components/ui';
import { api, type Child, type Family, type Item } from '@/lib/api';
import { ChildSwitcher, setCurrentChild, useCurrentChild } from '@/lib/currentChild';
import { weekdaysLabel } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { EMOJIS, ITEM_PRESETS } from '@/lib/presets';
import { radius, usePalette } from '@/lib/theme';

type Draft = Partial<Item> & { everyDay?: boolean };

export default function Lists() {
  const p = usePalette();
  const t = useT();
  const [items, setItems] = useState<Item[] | null>(null);
  const [fam, setFam] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kids, setKids] = useState<Child[]>([]);
  const [childId] = useCurrentChild(kids);
  // items belong to the family (for everyone or one child): the view shows all of them unless filtered by a child
  const [showAll, setShowAll] = useState(true);
  const toast = useToast();
  // A delete is held back while its «Вернуть» toast is up, so undo keeps the same item (and its tasks).
  const pending = useRef<{ id: number; timer: ReturnType<typeof setTimeout> } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, me] = await Promise.all([api.setup(), api.me()]);
      setItems(s.items.filter((x) => x.id !== pending.current?.id));
      setFam(me.family);
      setKids(me.children);
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

  const multi = kids.length > 1;
  const filter = multi && !showAll ? childId : null;
  const kidName = (id: number | null | undefined) => (id ? kids.find((c) => c.id === id)?.name : undefined);
  const shown = filter === null ? items : items.filter((x) => !x.child_id || x.child_id === filter);
  const switchChild = (id: number | null) => {
    setShowAll(id === null);
    if (id !== null) setCurrentChild(id);
  };
  const openNew = (preset?: (typeof ITEM_PRESETS)[number]) =>
    setDraft({
      title: preset?.title ?? '',
      emoji: preset?.emoji ?? '✅',
      needs_photo: preset?.needs_photo ?? false,
      required: preset?.required ?? true,
      weekdays: null,
      everyDay: true,
      // filtered by a child: a new item is for that child (changeable in the sheet)
      child_id: filter,
    });
  const save = async () => {
    if (!draft?.title?.trim()) return;
    const body = {
      title: draft.title.trim(),
      emoji: draft.emoji ?? '✅',
      needs_photo: !!draft.needs_photo,
      required: draft.required !== false,
      weekdays: draft.everyDay || !draft.weekdays?.length ? null : draft.weekdays,
      // null = for every child; left untouched for a single-child family
      ...(multi ? { child_id: kidName(draft.child_id) ? draft.child_id : null } : {}),
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
    toast.show(t('parent.lists.deleted', { title: it.title }), {
      label: t('parent.restore'),
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
      <Screen title={t('parent.tab.lists')} subtitle={t('parent.lists.subtitle')} onRefresh={load} right={<Btn small title={t('common.add')} icon="add" onPress={() => openNew()} />}>
        <ChildSwitcher list={kids} value={filter} onChange={switchChild} all />
        {shown.length ? (
          <Group>
            {shown.map((it) => {
              const who = multi ? kidName(it.child_id) : undefined;
              return (
                <Row
                  key={it.id}
                  icon={it.emoji}
                  title={it.title}
                  subtitle={`${weekdaysLabel(it.weekdays)} · ${it.needs_photo ? t('parent.lists.withPhoto') : t('parent.lists.withCheck')}${it.required ? '' : t('parent.lists.optional')}`}
                  right={
                    who ? (
                      <View style={[styles.tag, { backgroundColor: p.brandSoft }]}>
                        <Txt v="sub" color={p.brand} numberOfLines={1} style={{ fontWeight: '600' }}>
                          {who}
                        </Txt>
                      </View>
                    ) : undefined
                  }
                  chevron
                  onPress={() => setDraft({ ...it, everyDay: !it.weekdays?.length })}
                />
              );
            })}
          </Group>
        ) : (
          <Group>
            <Empty icon="bag-handle-outline" title={t('parent.lists.emptyTitle')} text={t('parent.lists.emptyText')} />
          </Group>
        )}
        {unused.length ? (
          <>
            <SectionLabel>{t('parent.lists.quickAdd')}</SectionLabel>
            <View style={styles.wrap}>
              {unused.map((x) => (
                <Chip key={x.title} label={`${x.emoji} ${x.title}`} icon="add" tone="muted" onPress={() => openNew(x)} />
              ))}
            </View>
          </>
        ) : null}
        <Txt v="sub" color={p.muted} style={{ marginTop: 16, marginHorizontal: 4 }}>
          {t('parent.lists.footer')}
        </Txt>
      </Screen>

      <Sheet visible={!!draft} title={draft?.id ? t('parent.lists.editTitle') : t('parent.lists.newTitle')} onClose={() => setDraft(null)} overlay={toast.node}>
        <Field label={t('parent.lists.what')} value={draft?.title ?? ''} onChangeText={(title) => setDraft({ ...draft, title })} placeholder={t('parent.lists.whatPh')} maxLength={50} />
        <Txt v="sub" color={p.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
          {t('parent.icon')}
        </Txt>
        <EmojiPicker value={draft?.emoji ?? '✅'} options={EMOJIS} onChange={(emoji) => setDraft({ ...draft, emoji })} />
        {multi ? (
          <View style={{ marginTop: 14 }}>
            <Txt v="sub" color={p.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
              {t('parent.lists.forWhom')}
            </Txt>
            <View style={styles.wrap}>
              <Chip label={t('parent.kids.all')} selected={!kidName(draft?.child_id)} onPress={() => setDraft({ ...draft, child_id: null })} />
              {kids.map((c) => (
                <Chip key={c.id} label={c.name} selected={draft?.child_id === c.id} onPress={() => setDraft({ ...draft, child_id: c.id })} />
              ))}
            </View>
          </View>
        ) : null}
        <Group style={{ marginTop: 14 }}>
          <ToggleRow icon="camera" tint="blue" title={t('parent.lists.needsPhoto')} subtitle={t('parent.lists.needsPhotoSub')} value={!!draft?.needs_photo} onChange={(needs_photo) => setDraft({ ...draft, needs_photo })} />
          <ToggleRow icon="alert" tint="red" title={t('parent.lists.required')} subtitle={t('parent.lists.requiredSub')} value={draft?.required !== false} onChange={(required) => setDraft({ ...draft, required })} />
          <ToggleRow icon="calendar" tint="teal" title={t('common.everySchoolDay')} value={!!draft?.everyDay} onChange={(everyDay) => setDraft({ ...draft, everyDay, weekdays: everyDay ? null : draft?.weekdays ?? [] })} />
        </Group>
        {!draft?.everyDay ? (
          <View style={{ marginTop: 12 }}>
            <Txt v="sub" color={p.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
              {t('parent.lists.which')}
            </Txt>
            <WeekdayPicker value={draft?.weekdays ?? []} onChange={(weekdays) => setDraft({ ...draft, weekdays })} only={fam.school_weekdays} />
          </View>
        ) : null}
        <Btn title={t('common.save')} onPress={save} disabled={!draft?.title?.trim() || (!draft?.everyDay && !draft?.weekdays?.length)} style={{ marginTop: 16 }} />
        {draft?.id ? <Btn title={t('common.delete')} kind="ghost" icon="trash-outline" onPress={() => remove(draft.id!)} style={{ marginTop: 10 }} /> : null}
      </Sheet>
      {draft ? null : toast.node}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderRadius: radius.xs, paddingHorizontal: 7, paddingVertical: 2, maxWidth: 110 },
});
