import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, Txt } from '@/components/ui';
import { api, type Role } from '@/lib/api';
import { gradients, radius, usePalette } from '@/lib/theme';

// Shown when the server answers 402: the family's subscription is not active.
// The child can only ask a parent; purchases happen on a parent's phone.
export function Paywall({ role, onActive }: { role: Role; onActive: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const a = await api.billingRefresh();
      if (a.active) onActive();
      else setMsg('Подписка пока не активна');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: p.bg, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <Txt v="largeTitle" color="#fff">
          {role === 'parent' ? 'Подписка закончилась' : 'Приложение на паузе'}
        </Txt>
        <Txt v="body" color="rgba(255,255,255,0.9)" style={{ marginTop: 10 }}>
          {role === 'parent'
            ? 'Все задания, расписание и фото сохранены. Продлите подписку — и всё снова заработает на всех телефонах семьи.'
            : 'Попроси родителя продлить подписку «Уроки». Твои задания и серия дней сохранены.'}
        </Txt>
      </LinearGradient>
      <View style={{ gap: 10 }}>
        {msg ? (
          <Txt v="callout" color={p.muted} style={{ textAlign: 'center' }}>
            {msg}
          </Txt>
        ) : null}
        <Btn title={role === 'parent' ? 'Я уже оплатил — проверить' : 'Проверить снова'} kind={role === 'parent' ? 'secondary' : 'primary'} loading={busy} onPress={refresh} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20, justifyContent: 'space-between' },
  card: { borderRadius: radius.xl, padding: 22 },
});
