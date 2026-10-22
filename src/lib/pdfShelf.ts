import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { storage } from './storage';

// The child's own PDF textbooks: picked from Files, copied into the app's document directory, listed in local
// storage. They never leave the phone (nothing is uploaded). docs/SCREEN_TIME.md "textbooks".
export type LocalPdf = { id: string; title: string; file: string; size: number };

const KEY = 'uroki.pdfs';
// keeps the stored list small (SecureStore values should stay around 2 KB)
export const MAX_PDFS = 20;
export const pdfSupported = Platform.OS !== 'web';

const dir = () => new Directory(Paths.document, 'textbooks');
const fileOf = (p: LocalPdf) => new File(dir(), p.file);

async function save(list: LocalPdf[]) {
  await storage.set(KEY, JSON.stringify(list));
}

/** The stored list, without entries whose file has gone (app data cleared, restored backup). */
export async function listPdfs(): Promise<LocalPdf[]> {
  if (!pdfSupported) return [];
  let list: LocalPdf[] = [];
  try {
    const raw = await storage.get(KEY);
    const v = raw ? JSON.parse(raw) : [];
    if (Array.isArray(v)) list = v.filter((x) => x && typeof x.id === 'string' && typeof x.file === 'string');
  } catch {}
  const kept = list.filter((p) => {
    try {
      return fileOf(p).exists;
    } catch {
      return false;
    }
  });
  if (kept.length !== list.length) await save(kept).catch(() => {});
  return kept;
}

export class PdfError extends Error {
  constructor(public code: 'full' | 'notPdf' | 'copy') {
    super(code);
  }
}

/** Opens the system file picker for one PDF and keeps a private copy. null = the child cancelled. */
export async function addPdf(current: LocalPdf[]): Promise<LocalPdf[] | null> {
  if (current.length >= MAX_PDFS) throw new PdfError('full');
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const isPdf = a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.name ?? '');
  if (!isPdf) throw new PdfError('notPdf');
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const entry: LocalPdf = { id, title: (a.name ?? 'PDF').replace(/\.pdf$/i, '').trim().slice(0, 80) || 'PDF', file: `${id}.pdf`, size: a.size ?? 0 };
  try {
    const d = dir();
    d.create({ intermediates: true, idempotent: true });
    const src = new File(a.uri);
    await src.copy(fileOf(entry));
    // the picker's cache copy is not needed any more
    try {
      src.delete();
    } catch {}
  } catch {
    throw new PdfError('copy');
  }
  const next = [...current, entry];
  await save(next);
  return next;
}

export async function removePdf(current: LocalPdf[], id: string): Promise<LocalPdf[]> {
  const p = current.find((x) => x.id === id);
  if (p) {
    try {
      const f = fileOf(p);
      if (f.exists) f.delete();
    } catch {}
  }
  const next = current.filter((x) => x.id !== id);
  await save(next);
  return next;
}

/** file:// URI of the private copy (iOS shows it in the in-app WebView). */
export const pdfUri = (p: LocalPdf) => fileOf(p).uri;

/**
 * Android: its WebView cannot render PDFs, so the copy opens in the phone's PDF viewer through an ACTION_VIEW
 * intent with a content:// URI and a read grant (FLAG_GRANT_READ_URI_PERMISSION = 1). Without a viewer app the
 * system share sheet is the fallback. Returns false when nothing could open it.
 */
export async function openPdfExternally(p: LocalPdf): Promise<boolean> {
  const f = fileOf(p);
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: f.contentUri, type: 'application/pdf', flags: 1 });
      return true;
    } catch {}
  }
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(f.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: p.title });
    return true;
  } catch {
    return false;
  }
}

export const sizeLabel = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
