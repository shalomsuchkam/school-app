import { setThemeMode, THEME_MODES, useAppearance, type ThemeMode } from '@/lib/appearance';
import { useT } from '@/lib/i18n';
import type { TileColor } from '@/lib/theme';
import { usePalette } from '@/lib/theme';

import { Group, Icon, Row } from './ui';

const ICON: Record<ThemeMode, { icon: string; tint: TileColor }> = {
  system: { icon: 'phone-portrait', tint: 'gray' },
  light: { icon: 'sunny', tint: 'orange' },
  dark: { icon: 'moon', tint: 'violet' },
  schedule: { icon: 'time', tint: 'teal' },
};

/** System / light / dark / by schedule (dark 20:00–07:00), stored on this device only. */
export function AppearancePicker() {
  const p = usePalette();
  const t = useT();
  const { mode } = useAppearance();
  return (
    <Group>
      {THEME_MODES.map((m) => (
        <Row
          key={m}
          icon={ICON[m].icon}
          tint={ICON[m].tint}
          title={t(`common.theme.${m}`)}
          subtitle={m === 'schedule' ? t('common.theme.scheduleSub') : m === 'system' ? t('common.theme.systemSub') : undefined}
          onPress={() => setThemeMode(m)}
          right={mode === m ? <Icon name="checkmark" size={20} color={p.brand} /> : undefined}
          selected={mode === m}
        />
      ))}
    </Group>
  );
}
