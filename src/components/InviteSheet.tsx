import { useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, View } from 'react-native';

import { api, type Role } from '@/lib/api';
import { radius, usePalette } from '@/lib/theme';

import { Btn, Sheet, Txt } from './ui';

export function InviteSheet({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const p = usePalette();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!role) return;
    let alive = true;
    api
      .invite(role)
      .then((r) => alive && setCode(r.code))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
      setCode(null);
      setError(null);
    };
  }, [role]);
  const who = role === 'child' ? 'ученика' : 'второго родителя';
  return (
    <Sheet visible={!!role} title={`Пригласить ${who}`} onClose={onClose}>
      <Txt v="callout" color={p.muted}>
        Установите приложение «Уроки» на телефон {role === 'child' ? 'ребёнка' : 'родителя'}, нажмите «У меня есть код» и введите:
      </Txt>
      <View style={[styles.box, { backgroundColor: p.brandSoft }]}>
        {code ? (
          <Txt v="largeTitle" color={p.brand} style={{ fontSize: 40, lineHeight: 48, letterSpacing: 8 }} selectable>
            {code}
          </Txt>
        ) : error ? (
          <Txt v="callout" color={p.bad}>
            {error}
          </Txt>
        ) : (
          <ActivityIndicator color={p.brand} />
        )}
      </View>
      <Txt v="sub" color={p.muted} style={{ textAlign: 'center' }}>
        Код одноразовый и действует 48 часов
      </Txt>
      {code ? (
        <Btn
          title="Отправить код"
          icon="↗"
          kind="secondary"
          style={{ marginTop: 16 }}
          onPress={() => Share.share({ message: `Код для входа в приложение «Уроки»: ${code}` })}
        />
      ) : null}
    </Sheet>
  );
}
const styles = StyleSheet.create({ box: { borderRadius: radius.l, paddingVertical: 26, alignItems: 'center', marginVertical: 16 } });
