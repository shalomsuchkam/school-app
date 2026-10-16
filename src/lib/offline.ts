import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { useEffect, useSyncExternalStore } from 'react';

import { api, ApiError } from './api';
import { storage } from './storage';

// Offline photo queue: a homework photo that could not be sent for lack of network is copied into the
// app's document directory and sent later (on the next successful refresh / app foreground), in order.
export type QueuedPhoto = { task_id: number; uri: string; page: number; created_at: number };

const KEY = 'uroki.photoQueue';
const MAX_AGE = 3 * 24 * 60 * 60 * 1000;
// SecureStore values should stay small (~2 KB on Android): a dozen entries is plenty for one evening.
const MAX_ITEMS = 10;
const supported = Platform.OS !== 'web';

let items: QueuedPhoto[] = [];
let loaded: Promise<void> | null = null;
// The stored list could not be read (keychain locked…): keep it and the files intact for this session.
let readFailed = false;
let flushing: Promise<FlushResult> | null = null;
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
const getItems = () => items;

const queueDir = () => new Directory(Paths.document, 'queue');
// The app container path can change between app updates (iOS), so files are resolved by name.
const fileOf = (q: QueuedPhoto) => new File(queueDir(), q.uri.split('/').pop() ?? q.uri);

/** A network failure (no connection), as opposed to a server answer. */
export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0;

function ensureLoaded() {
  if (!supported) return Promise.resolve();
  loaded ??= (async () => {
    let raw: string | null;
    try {
      raw = await storage.get(KEY);
    } catch {
      readFailed = true;
      return;
    }
    try {
      const list = raw ? (JSON.parse(raw) as QueuedPhoto[]) : [];
      if (Array.isArray(list)) set(list.filter((q) => q && typeof q.task_id === 'number' && typeof q.uri === 'string'), false);
    } catch {}
  })();
  return loaded;
}

function set(next: QueuedPhoto[], persist = true) {
  items = next;
  listeners.forEach((f) => f());
  if (persist && !readFailed) storage.set(KEY, JSON.stringify(next)).catch(() => {});
}

function remove(q: QueuedPhoto) {
  try {
    const f = fileOf(q);
    if (f.exists) f.delete();
  } catch {}
  set(items.filter((x) => x !== q));
}

/** Keeps a copy of the compressed photo for a later upload. Throws when it can't be stored. */
export async function enqueuePhoto(task_id: number, uri: string, page: number) {
  if (!supported) throw new Error('unsupported');
  await ensureLoaded();
  if (items.length >= MAX_ITEMS) throw new Error('queue full');
  const dir = queueDir();
  dir.create({ intermediates: true, idempotent: true });
  const created_at = Date.now();
  const dest = new File(dir, `${task_id}-${page}-${created_at}.jpg`);
  await new File(uri).copy(dest);
  set([...items, { task_id, uri: dest.uri, page, created_at }]);
}

export type FlushResult = { sent: number; dropped: number };

/** Sends queued photos in order. Stops at the first network/server problem and keeps the rest. */
export function flushQueue(): Promise<FlushResult> {
  if (!supported) return Promise.resolve({ sent: 0, dropped: 0 });
  flushing ??= (async () => {
    let sent = 0;
    let dropped = 0;
    try {
      await ensureLoaded();
      for (const q of [...items]) {
        const f = fileOf(q);
        if (Date.now() - q.created_at > MAX_AGE || !f.exists) {
          remove(q);
          dropped++;
          continue;
        }
        try {
          await api.photo(q.task_id, f.uri);
          remove(q);
          sent++;
        } catch (e) {
          // Any other client error (task gone, another day, deleted subject…): this photo can never be delivered.
          // 401 (signed out), 402 (paywall), 408 and 429 (try again later) keep it.
          if (e instanceof ApiError && e.status >= 400 && e.status < 500 && ![401, 402, 408, 429].includes(e.status)) {
            remove(q);
            dropped++;
            continue;
          }
          break; // offline again, paywall, server error: try later, keep the order
        }
      }
      if (!items.length) cleanupOrphans();
    } finally {
      flushing = null;
    }
    return { sent, dropped };
  })();
  return flushing;
}

// Files left behind by an interrupted write once the queue is empty.
function cleanupOrphans() {
  if (readFailed) return; // they may belong to the list we could not read
  try {
    const dir = queueDir();
    if (dir.exists) for (const x of dir.list()) x.delete();
  } catch {}
}

/** Forgets every queued photo (sign-out: they belong to the previous account). */
export async function clearPhotoQueue() {
  if (!supported) return;
  await flushing?.catch(() => {});
  readFailed = false;
  loaded = Promise.resolve();
  set([], false);
  cleanupOrphans();
  await storage.del(KEY).catch(() => {});
}

/** Current queue length (outside React, e.g. inside a fetch callback). */
export const pendingPhotos = () => items.length;

/** Live queue contents (re-renders on change). */
export function usePhotoQueue() {
  useEffect(() => {
    ensureLoaded();
  }, []);
  return useSyncExternalStore(subscribe, getItems, getItems);
}
