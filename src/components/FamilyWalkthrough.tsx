import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Btn, Card, SectionLabel, Txt } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { usePalette } from '@/lib/theme';

type Step = 'assigned' | 'submitted' | 'redo' | 'resubmitted' | 'accepted';

/** An explicitly labelled local learning exercise, never a family session or device-control simulator. */
export function FamilyWalkthrough() {
  const t = useT();
  const p = usePalette();
  const [step, setStep] = useState<Step>('assigned');
  const [skip, setSkip] = useState<'none' | 'requested' | 'approved'>('none');
  const parent = step === 'submitted' || step === 'resubmitted';
  const complete = step === 'accepted' && skip === 'approved';
  return (
    <View style={{ gap: 12 }}>
      <Card tone="brand">
        <Txt v="headline">{t('walkthrough.label')}</Txt>
        <Txt v="callout" color={p.ink2} style={{ marginTop: 6 }}>{t('walkthrough.disclosure')}</Txt>
      </Card>
      <SectionLabel>{t('walkthrough.lesson')}</SectionLabel>
      <Card>
        <View style={{ gap: 12 }}>
          <Badge label={t(`walkthrough.state.${step}`)} tone={step === 'accepted' ? 'ok' : step === 'redo' ? 'warn' : 'neutral'} />
          <Txt v="title">{t('walkthrough.subject')}</Txt>
          <Txt>{t('walkthrough.assignment')}</Txt>
          <Txt v="sub" color={p.muted}>{t(parent ? 'walkthrough.parentTurn' : 'walkthrough.childTurn')}</Txt>
          <Txt accessibilityLiveRegion="polite">{t(`walkthrough.explain.${step}`)}</Txt>
          {step === 'assigned' ? <Btn title={t('walkthrough.submit')} onPress={() => setStep('submitted')} /> : null}
          {step === 'submitted' ? <Btn title={t('walkthrough.requestCorrection')} kind="secondary" onPress={() => setStep('redo')} /> : null}
          {step === 'redo' ? <Btn title={t('walkthrough.resubmit')} onPress={() => setStep('resubmitted')} /> : null}
          {step === 'resubmitted' ? <Btn title={t('walkthrough.accept')} kind="ok" onPress={() => setStep('accepted')} /> : null}
        </View>
      </Card>
      <SectionLabel>{t('walkthrough.skipTitle')}</SectionLabel>
      <Card>
        <View style={{ gap: 12 }}>
          <Txt v="headline">{t('walkthrough.skipTask')}</Txt>
          <Txt accessibilityLiveRegion="polite">{t(`walkthrough.skip.${skip}`)}</Txt>
          {skip === 'none' ? <Btn title={t('walkthrough.askSkip')} kind="secondary" onPress={() => setSkip('requested')} /> : null}
          {skip === 'requested' ? <Btn title={t('walkthrough.approveSkip')} kind="secondary" onPress={() => setSkip('approved')} /> : null}
        </View>
      </Card>
      {complete ? <Card tone="ok"><Txt v="headline" accessibilityLiveRegion="polite">{t('walkthrough.complete')}</Txt></Card> : null}
      <SectionLabel>{t('walkthrough.realTitle')}</SectionLabel>
      <Txt color={p.ink2}>{t('walkthrough.realText')}</Txt>
      <Btn title={t('walkthrough.reset')} kind="ghost" onPress={() => { setStep('assigned'); setSkip('none'); }} />
    </View>
  );
}
