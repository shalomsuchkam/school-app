import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, Txt } from '@/components/ui';
import { api, legalUrl, type Role } from '@/lib/api';
import { billingAvailable, buy, loadPlan, openManage, restore, type Plan } from '@/lib/billing';
import { getLang, useT } from '@/lib/i18n';
import { gradients, radius, usePalette } from '@/lib/theme';

// Shown when the server answers 402 (no active subscription), and from Settings to subscribe.
// The child can only ask a parent; purchases happen on a parent's phone through App Store / Google Play.
// Access is decided by the server: after a purchase or restore we ask it to re-check.
export function Paywall({ role, onActive }: { role: Role; onActive: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [busy, setBusy] = useState<null | 'buy' | 'restore' | 'check'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  // a family that has never had a subscription sees the trial offer instead of "your subscription has ended"
  const [fresh, setFresh] = useState(false);
  const parent = role === 'parent';
  const canPay = parent && billingAvailable();

  useEffect(() => {
    if (!parent) return;
    let alive = true;
    (async () => {
      try {
        const me = await api.me();
        if (!alive) return;
        setFamilyId(me.family.id);
        setFresh(!me.access.paid_until && !me.access.granted_until);
        if (!canPay) return;
        const pl = await loadPlan(me.family.id);
        if (alive) setPlan(pl);
      } catch (e) {
        if (alive) setMsg((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [parent, canPay]);

  const check = async (kind: 'check' | 'buy' | 'restore', silentInactive = false) => {
    const a = await api.billingRefresh();
    if (a.active) onActive();
    else if (!silentInactive) setMsg(t(kind === 'restore' ? 'parent.paywall.nothingToRestore' : 'parent.paywall.inactive'));
    return a.active;
  };
  const run = async (kind: 'buy' | 'restore' | 'check') => {
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === 'buy' && familyId && plan) {
        if (!(await buy(familyId, plan))) return;
        // the store webhook may land a moment later: retry once before saying "not active"
        if (!(await check('buy', true))) {
          await new Promise((r) => setTimeout(r, 2500));
          await check('buy');
        }
      } else if (kind === 'restore' && familyId) {
        await restore(familyId);
        await check('restore');
      } else await check('check');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const trial = plan?.trialDays;
  const title = !parent ? t('parent.paywall.titleChild') : fresh || trial ? t('parent.paywall.titleNew') : t('parent.paywall.titleParent');
  const text = !parent ? t('parent.paywall.textChild') : fresh ? t('parent.paywall.textNew') : t('parent.paywall.textParent');
  const lang = getLang();

  return (
    <ScrollView style={{ backgroundColor: p.bg }} contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <Txt v="largeTitle" color="#fff">
          {title}
        </Txt>
        <Txt v="body" color="rgba(255,255,255,0.9)" style={{ marginTop: 10 }}>
          {text}
        </Txt>
        {plan ? (
          <Txt v="headline" color="#fff" style={{ marginTop: 16 }}>
            {trial ? t('parent.paywall.price', { price: plan.price }) : t('parent.paywall.priceNoTrial', { price: plan.price })}
          </Txt>
        ) : null}
      </LinearGradient>

      <View style={{ gap: 10, marginTop: 24 }}>
        {msg ? (
          <Txt v="callout" color={p.muted} style={{ textAlign: 'center' }}>
            {msg}
          </Txt>
        ) : null}
        {canPay ? (
          <>
            <Btn
              title={trial ? t('parent.paywall.subscribe') : t('parent.paywall.subscribeNoTrial')}
              disabled={!plan || !!busy}
              loading={busy === 'buy'}
              onPress={() => run('buy')}
            />
            <Btn title={t('parent.paywall.restore')} kind="secondary" disabled={!familyId || !!busy} loading={busy === 'restore'} onPress={() => run('restore')} />
            <Btn title={t('parent.paywall.manage')} kind="plain" onPress={() => openManage()} />
          </>
        ) : (
          <>
            {parent ? (
              <Txt v="sub" color={p.muted} style={{ textAlign: 'center' }}>
                {t('parent.paywall.unavailable')}
              </Txt>
            ) : null}
            <Btn
              title={parent ? t('parent.paywall.checkParent') : t('parent.paywall.checkChild')}
              kind={parent ? 'secondary' : 'primary'}
              loading={busy === 'check'}
              onPress={() => run('check')}
            />
          </>
        )}
        {parent ? (
          <>
            <Txt v="sub" color={p.muted} style={{ marginTop: 8, lineHeight: 18 }}>
              {Platform.OS === 'ios' ? t('parent.paywall.legalIos') : t('parent.paywall.legalAndroid')}
            </Txt>
            <View style={styles.links}>
              <Txt v="sub" color={p.brand} onPress={() => Linking.openURL(legalUrl('terms', lang))}>
                {t('parent.paywall.terms')}
              </Txt>
              <Txt v="sub" color={p.brand} onPress={() => Linking.openURL(legalUrl('privacy', lang))}>
                {t('parent.paywall.privacy')}
              </Txt>
            </View>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: { borderRadius: radius.xl, padding: 22 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 6 },
});
