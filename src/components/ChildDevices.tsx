import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { InviteSheet } from '@/components/InviteSheet';
import { Btn, Field, Group, Row, SectionLabel, Sheet, Txt } from '@/components/ui';
import { api, type Child, type Me, type Member } from '@/lib/api';
import { childDevices, deviceKind } from '@/lib/devices';
import { lastSeen } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { usePalette } from '@/lib/theme';

const ICON = { android: 'logo-android', iphone: 'phone-portrait', ipad: 'tablet-portrait', web: 'globe', unknown: 'phone-portrait' } as const;

// Parent settings: each child's devices (phone, tablet…) with platform and last contact, rename and disconnect, and
// «Добавить устройство ребёнка» — a child invite for that same child (the server adds a device row with its child_id).
export function ChildDevices({ me, onChanged, onToast }: { me: Me; onChanged: () => void; onToast: (msg: string) => void }) {
  const p = usePalette();
  const t = useT();
  // kept after closing so the sheet keeps its title while it slides away
  const [invite, setInvite] = useState<{ child: Child; more: boolean } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const kids = me.children;

  const label = (m: Member) => m.name || t(`devices.kind.${deviceKind(m.platform, m.name)}`);
  const remove = (m: Member) =>
    Alert.alert(t('parent.settings.removeTitle', { label: label(m) }), t('parent.settings.removeMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('parent.settings.disconnect'),
        style: 'destructive',
        onPress: () =>
          api
            .removeMember(m.id)
            .catch((e) => onToast((e as Error).message))
            .finally(onChanged),
      },
    ]);
  const rename = async () => {
    const name = edit?.name.trim();
    if (!edit || !name) return;
    setBusy(true);
    try {
      await api.renameMember(edit.id, name);
      setEdit(null);
      onToast(t('parent.settings.saved'));
      onChanged();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {kids.map((c) => {
        const list = childDevices(me.members, c.id, kids.length === 1);
        return (
          <View key={c.id}>
            <SectionLabel>{kids.length > 1 ? t('devices.sectionOf', { name: c.name }) : t('devices.section')}</SectionLabel>
            <Group>
              {list.map((m) => {
                const kind = deviceKind(m.platform, m.name);
                const seen = lastSeen(m.last_seen);
                const kindLabel = t(`devices.kind.${kind}`);
                return (
                  <Row
                    key={m.id}
                    icon={ICON[kind]}
                    tint={seen?.online ? 'green' : 'blue'}
                    title={label(m)}
                    subtitle={[m.name && kind !== 'unknown' ? kindLabel : null, seen?.text].filter(Boolean).join(' · ') || undefined}
                    onPress={() => setEdit({ id: m.id, name: m.name ?? '' })}
                    right={
                      <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel={`${t('parent.settings.disconnect')}: ${label(m)}`} onPress={() => remove(m)}>
                        <Txt v="sub" color={p.bad} style={{ fontWeight: '600' }}>
                          {t('parent.settings.disconnect')}
                        </Txt>
                      </Pressable>
                    }
                  />
                );
              })}
              <Row
                icon="add"
                tint="green"
                title={list.length ? t('devices.add') : t('devices.addFirst')}
                chevron
                onPress={() => {
                  setInvite({ child: c, more: list.length > 0 });
                  setInviteOpen(true);
                }}
              />
            </Group>
            {list.length > 1 ? (
              <Txt v="sub" color={p.muted} style={{ marginTop: 8, marginHorizontal: 6 }}>
                {t('devices.hint')}
              </Txt>
            ) : null}
          </View>
        );
      })}

      <Sheet visible={edit !== null} title={t('devices.renameTitle')} onClose={() => setEdit(null)}>
        <Field value={edit?.name ?? ''} onChangeText={(name) => edit && setEdit({ ...edit, name })} placeholder={t('devices.renamePh')} maxLength={30} autoFocus onSubmitEditing={rename} />
        <Btn title={t('common.save')} disabled={!edit?.name.trim()} loading={busy} onPress={rename} />
      </Sheet>
      <InviteSheet
        role={inviteOpen ? 'child' : null}
        childId={invite?.child.id}
        childName={invite?.child.name}
        title={invite?.more ? 'devices.inviteTitle' : undefined}
        text={invite?.more ? 'devices.inviteText' : undefined}
        onClose={() => {
          setInviteOpen(false);
          onChanged();
        }}
      />
    </>
  );
}
