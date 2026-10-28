import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PromoForm } from '@/components/PromoForm';
import { BrandMark, Btn, IconBtn, NotebookRule, Txt } from '@/components/ui';
import { api, ApiError, legalUrl, type Role } from '@/lib/api';
import { billingAvailable, buy, loadPlan, openManage, restore, type Plan } from '@/lib/billing';
import { getLang, tn, useT } from '@/lib/i18n';
import { hairline, radius, space, usePalette } from '@/lib/theme';

// Shown when the server answers 402 (no active subscription), and from Settings to subscribe (with onClose).
// The child can only ask a parent; purchases happen on a parent's phone through App Store / Google Play.
// Access is decided by the server: after a purchase or restore we ask it to re-check.
export function Paywall({ role, onActive, onClose }: { role: Role; onActive: () => void; onClose?: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [busy, setBusy] = useState<null | 'buy' | 'restore' | 'check'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  // the store offer could not be loaded (or there is none): offer a retry instead of a dead button
  const [planFailed, setPlanFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // a family that has never had a subscription sees the trial offer instead of "your subscription has ended"
  const [fresh, setFresh] = useState(false);
  // «Есть промокод?»: the input opens in place; after a redeemed code the line it opened and a way on
  const [promo, setPromo] = useState(false);
  const [promoDone, setPromoDone] = useState<{ message: string; active: boolean } | null>(null);
  const parent = role === 'parent';
  const canPay = parent && billingAvailable();

  useEffect(() => {
    if (!parent) return;
    let alive = true;
    (async () => {
      let id: string;
      try {
        const me = await api.me();
        if (!alive) return;
        id = me.family.id;
        setFamilyId(id);
        setFresh(!me.access.paid_until && !me.access.granted_until);
      } catch (e) {
        if (alive) setMsg((e as Error).message);
        return;
      }
      if (!canPay) return;
      try {
        const pl = await loadPlan(id);
        if (!alive) return;
        setPlan(pl);
        setPlanFailed(!pl);
      } catch {
        if (alive) setPlanFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [parent, canPay, attempt]);
  const retryPlan = () => {
    setPlanFailed(false);
    setMsg(null);
    setAttempt((n) => n + 1);
  };

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
      // server answers are already translated; store SDK errors are not (cancelling the sheet never gets here)
      setMsg(e instanceof ApiError ? e.message : t('parent.paywall.storeFail'));
    } finally {
      setBusy(null);
    }
  };

  // The trial is promised only when the store offers it to this account (see loadPlan).
  const trial = plan?.trialDays ?? null;
  const title = !parent ? t('parent.paywall.titleChild') : trial ? tn('parent.paywall.titleTrial', trial) : fresh ? t('parent.paywall.titleNew') : t('parent.paywall.titleParent');
  const text = !parent ? t('parent.paywall.textChild') : fresh ? t('parent.paywall.textNew') : t('parent.paywall.textParent');
  // what will be billed, as prominent as anything "free" on the screen (App Store 3.1.2)
  const billed = plan ? (trial ? tn('parent.paywall.trialLine', trial, { price: plan.price }) : t('parent.paywall.billedLine', { price: plan.price })) : null;
  const lang = getLang();

  return (
    <ScrollView style={{ backgroundColor: p.bg }} contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      {onClose ? (
        <View style={styles.close}>
          <IconBtn icon="close" label={t('common.close')} onPress={onClose} />
        </View>
      ) : null}
      <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
        <NotebookRule height={84} step={21} marginX={22} />
        <BrandMark size={56} />
        <Txt v="title" accessibilityRole="header" style={{ marginTop: space.m }}>
          {title}
        </Txt>
        <Txt v="body" color={p.ink2} style={{ marginTop: space.xs }}>
          {text}
        </Txt>
      </View>

      <View style={{ gap: 10, marginTop: 24 }}>
        {billed ? (
          <Txt v="title" style={{ textAlign: 'center', marginBottom: 4 }}>
            {billed}
          </Txt>
        ) : null}
        {msg ? (
          <Txt v="callout" color={p.muted} style={{ textAlign: 'center' }}>
            {msg}
          </Txt>
        ) : null}
        {canPay && planFailed ? (
          <>
            <Txt v="callout" color={p.muted} style={{ textAlign: 'center' }}>
              {t('parent.paywall.planFail')}
            </Txt>
            <Btn title={t('common.retry')} icon="refresh" kind="secondary" onPress={retryPlan} />
          </>
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
            {promoDone ? (
              <View style={{ gap: 10, marginTop: 8 }}>
                <Txt v="headline" color={p.ok} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
                  {promoDone.message}
                </Txt>
                {promoDone.active ? <Btn title={t('parent.promo.continue')} onPress={onActive} /> : null}
              </View>
            ) : promo ? (
              <View style={{ marginTop: 8 }}>
                <PromoForm autoFocus onRedeemed={(a, message) => setPromoDone({ message, active: a.active })} />
              </View>
            ) : (
              <Pressable accessibilityRole="button" hitSlop={8} style={[styles.link, { alignSelf: 'center' }]} onPress={() => setPromo(true)}>
                <Txt v="callout" color={p.brand}>
                  {t('parent.promo.link')}
                </Txt>
              </Pressable>
            )}
            <View style={styles.links}>
              <Pressable accessibilityRole="link" hitSlop={8} style={styles.link} onPress={() => Linking.openURL(legalUrl('terms', lang))}>
                <Txt v="sub" color={p.brand}>
                  {t('parent.paywall.terms')}
                </Txt>
              </Pressable>
              <Pressable accessibilityRole="link" hitSlop={8} style={styles.link} onPress={() => Linking.openURL(legalUrl('privacy', lang))}>
                <Txt v="sub" color={p.brand}>
                  {t('parent.paywall.privacy')}
                </Txt>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: { borderRadius: radius.xl, borderWidth: hairline, padding: 22, paddingTop: 28, overflow: 'hidden' },
  close: { alignItems: 'flex-end', marginTop: -16, marginBottom: 12 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 6 },
  // ≥ 44pt touch target around the short link text
  link: { minHeight: 44, justifyContent: 'center' },
});
