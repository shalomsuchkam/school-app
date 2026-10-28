import { useState } from 'react';
import { View } from 'react-native';

import { api, type Access } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { space, usePalette } from '@/lib/theme';
import { normPromo, promoLooksValid, promoSuccess } from '@/lib/vacation';

import { Btn, Field, Txt } from './ui';

/**
 * A promo code from the owner: input + «Применить». The server checks and applies it (POST /parent/promo) and
 * answers with the family's new access state; `onRedeemed` gets it with the «Доступ открыт до …» line to show.
 */
export function PromoForm({ onRedeemed, autoFocus }: { onRedeemed: (a: Access, message: string) => void; autoFocus?: boolean }) {
  const p = usePalette();
  const t = useT();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apply = async () => {
    if (!promoLooksValid(code)) return setError(t('parent.promo.invalid'));
    setBusy(true);
    setError(null);
    try {
      const a = await api.redeemPromo(normPromo(code));
      setCode('');
      onRedeemed(a, promoSuccess(a));
    } catch (e) {
      // server answers come translated («Промокод не найден», «…уже использован», «Срок … истёк», too many tries)
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View>
      <Field
        label={t('parent.promo.title')}
        value={code}
        onChangeText={(v) => {
          setCode(v);
          if (error) setError(null);
        }}
        placeholder={t('parent.promo.ph')}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        maxLength={24}
        autoFocus={autoFocus}
        returnKeyType="done"
        onSubmitEditing={apply}
      />
      <Txt v="sub" color={p.muted} style={{ marginBottom: space.s, marginLeft: 2 }}>
        {t('parent.promo.hint')}
      </Txt>
      {error ? (
        <Txt v="callout" color={p.bad} style={{ marginBottom: space.s }} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
      <Btn title={t('parent.promo.apply')} icon="pricetag-outline" kind="secondary" loading={busy} disabled={!code.trim()} onPress={apply} />
    </View>
  );
}
