import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable } from 'react-native';

import { Group, Row, SectionLabel, Txt } from '@/components/ui';
import { api, type Textbook } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { addPdf, listPdfs, MAX_PDFS, openPdfExternally, pdfSupported, pdfUri, PdfError, removePdf, sizeLabel, type LocalPdf } from '@/lib/pdfShelf';
import { httpHost } from '@/lib/screenTime';
import { space, usePalette } from '@/lib/theme';

// Child home: «Учебники». The parent's links open in the in-app viewer (child/reader); the child's own PDFs
// stay on this phone (iOS shows them in-app, Android hands them to a PDF app).
export function Bookshelf({ onToast }: { onToast: (msg: string) => void }) {
  const p = usePalette();
  const t = useT();
  const [links, setLinks] = useState<Textbook[]>([]);
  const [pdfs, setPdfs] = useState<LocalPdf[]>([]);
  const [adding, setAdding] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api
        .textbooks()
        .then(setLinks)
        .catch(() => {}); // offline: keep what is on screen
      listPdfs()
        .then(setPdfs)
        .catch(() => {});
    }, []),
  );

  const openLink = (b: Textbook) => router.push({ pathname: '/child/reader', params: { url: b.url, title: b.title } });
  const openPdf = async (f: LocalPdf) => {
    if (Platform.OS === 'ios') return router.push({ pathname: '/child/reader', params: { pdf: pdfUri(f), title: f.title } });
    if (!(await openPdfExternally(f))) onToast(t('books.noViewer'));
  };
  const add = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const next = await addPdf(pdfs);
      if (next) {
        setPdfs(next);
        onToast(t('books.pdfAdded'));
      }
    } catch (e) {
      const code = e instanceof PdfError ? e.code : 'copy';
      onToast(t(`books.err.${code}`, { n: MAX_PDFS }));
    } finally {
      setAdding(false);
    }
  };
  const remove = (f: LocalPdf) =>
    Alert.alert(t('books.deleteTitle'), f.title, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removePdf(pdfs, f.id).then(setPdfs).catch(() => {}) },
    ]);

  if (!links.length && !pdfSupported) return null;
  return (
    <>
      <SectionLabel>{t('books.title')}</SectionLabel>
      <Group>
        {links.map((b) => (
          <Row key={`l${b.id}`} icon="book" tint="violet" title={b.title} subtitle={httpHost(b.url) ?? undefined} chevron onPress={() => openLink(b)} />
        ))}
        {pdfs.map((f) => (
          <Row
            key={f.id}
            icon="document-text"
            tint="orange"
            title={f.title}
            subtitle={f.size ? `PDF · ${sizeLabel(f.size)}` : 'PDF'}
            onPress={() => openPdf(f)}
            right={
              <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel={`${t('common.delete')}: ${f.title}`} onPress={() => remove(f)}>
                <Txt v="sub" color={p.bad} style={{ fontWeight: '600' }}>
                  {t('common.delete')}
                </Txt>
              </Pressable>
            }
          />
        ))}
        {pdfSupported ? <Row key="add" icon="add" tint="orange" title={adding ? t('books.adding') : t('books.addPdf')} onPress={add} disabled={adding} /> : null}
      </Group>
      <Txt v="sub" color={p.muted} style={{ marginTop: space.xs, marginHorizontal: 6 }}>
        {links.length ? t('books.hint') : t('books.hintEmpty')}
      </Txt>
    </>
  );
}
