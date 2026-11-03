import type { LocalPdf } from './pdfShelf';

// Routes carry an opaque shelf ID, never an arbitrary URL or filesystem path.
export function selectedPdf(list: LocalPdf[], id: unknown): LocalPdf | null {
  if (typeof id !== 'string' || !/^[a-z0-9]+$/.test(id)) return null;
  return list.find((p) => p.id === id && p.file === `${id}.pdf`) ?? null;
}

export function allowPdfNavigation(source: string, next: string): boolean {
  return source.startsWith('file://') && (next === source || next === 'about:blank');
}
