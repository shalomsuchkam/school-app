import { router } from 'expo-router';

import { FamilyWalkthrough } from '@/components/FamilyWalkthrough';
import { Btn, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function HowItWorks() {
  const t = useT();
  const { session } = useAuth();
  return (
    <Screen title={t('walkthrough.title')} subtitle={t('walkthrough.subtitle')}>
      <Btn title={t('common.back')} kind="ghost" icon="chevron-back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
      <FamilyWalkthrough />
      {!session ? <Btn title={t('onboarding.welcome.parent')} onPress={() => router.push('/onboarding')} /> : null}
    </Screen>
  );
}
