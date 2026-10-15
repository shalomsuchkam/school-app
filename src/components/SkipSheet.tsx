import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import type { Task } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { usePalette } from '@/lib/theme';

import { Btn, Chip, Field, Sheet, Txt } from './ui';

export function SkipSheet({ task, onClose, onSend, overlay }: { task: Task | null; onClose: () => void; onSend: (reason: string) => Promise<void>; overlay?: ReactNode }) {
  const p = usePalette();
  const t = useT();
  const reasonKeys = task?.kind === 'lesson' ? ['child.skip.notAssigned', 'child.skip.noLesson', 'child.skip.other'] : ['child.skip.notTomorrow', 'child.skip.other'];
  const reasons = reasonKeys.map((k) => t(k));
  const [sel, setSel] = useState(0);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  // Start fresh for every task: lessons and items have different reason lists.
  const [forId, setForId] = useState(task?.id);
  if (task && task.id !== forId) {
    setForId(task.id);
    setSel(0);
    setOther('');
  }
  const idx = Math.min(sel, reasons.length - 1);
  const reason = reasons[idx];
  const isOther = reasonKeys[idx] === 'child.skip.other';
  const send = async () => {
    setBusy(true);
    try {
      await onSend(isOther ? other.trim() || t('child.skip.other') : reason);
      setSel(0);
      setOther('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={!!task} title={`${task?.emoji ?? ''} ${task?.label ?? ''}`} onClose={onClose} overlay={overlay}>
      <Txt v="callout" color={p.muted}>
        {t('child.skip.hint')}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {reasons.map((r, i) => (
          <Chip key={r} label={r} selected={i === idx} onPress={() => setSel(i)} />
        ))}
      </View>
      {isOther ? <Field value={other} onChangeText={setOther} placeholder={t('child.skip.placeholder')} maxLength={100} style={{ marginTop: 12 }} /> : null}
      <Btn title={t('child.skip.send')} onPress={send} loading={busy} style={{ marginTop: 16 }} />
    </Sheet>
  );
}
