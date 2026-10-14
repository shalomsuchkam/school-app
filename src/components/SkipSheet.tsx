import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import type { Task } from '@/lib/api';
import { usePalette } from '@/lib/theme';

import { Btn, Chip, Field, Sheet, Txt } from './ui';

export function SkipSheet({ task, onClose, onSend, overlay }: { task: Task | null; onClose: () => void; onSend: (reason: string) => Promise<void>; overlay?: ReactNode }) {
  const p = usePalette();
  const reasons = task?.kind === 'lesson' ? ['Не задали', 'Урока не будет', 'Другая причина'] : ['Не нужно завтра', 'Другая причина'];
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
  const isOther = reason === 'Другая причина';
  const send = async () => {
    setBusy(true);
    try {
      await onSend(isOther ? other.trim() || 'Другая причина' : reason);
      setSel(0);
      setOther('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={!!task} title={`${task?.emoji ?? ''} ${task?.label ?? ''}`} onClose={onClose} overlay={overlay}>
      <Txt v="callout" color={p.muted}>
        Родитель получит запрос. Пока он не одобрит, пункт не засчитается.
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {reasons.map((r, i) => (
          <Chip key={r} label={r} selected={i === idx} onPress={() => setSel(i)} />
        ))}
      </View>
      {isOther ? <Field value={other} onChangeText={setOther} placeholder="Напиши причину" maxLength={100} style={{ marginTop: 12 }} /> : null}
      <Btn title="Отправить запрос" onPress={send} loading={busy} style={{ marginTop: 16 }} />
    </Sheet>
  );
}
