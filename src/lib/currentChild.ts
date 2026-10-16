import { createElement, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui';

import type { Child } from './api';
import { useT } from './i18n';
import { storage } from './storage';

// The child a parent is looking at (Today, Report, Schedule, Lists share it); per device.
const KEY = 'uroki.currentChild';

let current: number | null = null;
let ready: Promise<number | null> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

export const getCurrentChild = () => current;

// The stored choice, read from storage once; screens await it before their first request.
export function currentChildReady(): Promise<number | null> {
  if (!ready) {
    ready = storage
      .get(KEY)
      .then((v) => {
        const n = Number(v);
        if (current === null && Number.isInteger(n) && n > 0) {
          current = n;
          emit();
        }
        return current;
      })
      .catch(() => current);
  }
  return ready.then(() => current);
}

export function setCurrentChild(id: number) {
  if (id === current) return;
  current = id;
  emit();
  storage.set(KEY, String(id)).catch(() => {});
}

// Sign-out: the next account starts from its own first child.
export async function clearCurrentChild() {
  current = null;
  ready = Promise.resolve(null);
  emit();
  await storage.del(KEY).catch(() => {});
}

// A stored id that is not (or no longer) in the family falls back to the first child, as the server does.
export const pickChild = (children: Child[], id: number | null = current) => children.find((c) => c.id === id)?.id ?? children[0]?.id ?? null;

export function useCurrentChild(children: Child[] | null | undefined): [number | null, (id: number) => void] {
  const stored = useSyncExternalStore(subscribe, getCurrentChild, getCurrentChild);
  return [children?.length ? pickChild(children, stored) : stored, setCurrentChild];
}

// Horizontal name chips; renders nothing for a family with a single child.
// `all` adds a leading "everyone" chip (selected when value is null).
export function ChildSwitcher({ list, value, onChange, all }: { list: Child[]; value: number | null; onChange: (id: number | null) => void; all?: boolean }) {
  const t = useT();
  if (list.length < 2) return null;
  const chips = list.map((c) => createElement(Chip, { key: c.id, label: c.name, selected: value === c.id, onPress: () => onChange(c.id) }));
  if (all) chips.unshift(createElement(Chip, { key: 'all', label: t('parent.kids.all'), selected: value === null, onPress: () => onChange(null) }));
  return createElement(
    ScrollView,
    {
      horizontal: true,
      showsHorizontalScrollIndicator: false,
      style: styles.scroll,
      contentContainerStyle: styles.row,
      accessibilityLabel: t('parent.kids.switchA11y'),
      keyboardShouldPersistTaps: 'handled',
    },
    chips,
  );
}

const styles = StyleSheet.create({
  scroll: { marginBottom: 14, flexGrow: 0 },
  row: { gap: 8, paddingHorizontal: 2 },
});
