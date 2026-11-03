import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable } from 'react-native';

import { Group, Row, SectionLabel, Txt } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { addPdf, listPdfs, MAX_PDFS, openPdfExternally, pdfSupported, PdfError, removePdf, sizeLabel, type LocalPdf } from '@/lib/pdfShelf';
import { space, usePalette } from '@/lib/theme';

// User-selected PDFs stay on this phone. No remote textbook catalog or website links.
export function Bookshelf({ onToast }: { onToast: (msg: string) => void }) {
  const p = usePalette();
  const t = useT();
  const [pdfs, setPdfs] = useState<LocalPdf[]>([]);
  const [adding, setAdding] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listPdfs()
        .then(setPdfs)
        .catch(() => {});
    }, []),
  );

  const openPdf = async (f: LocalPdf) => {
    if (Platform.OS === 'ios') return router.push({ pathname: '/child/reader', params: { pdfId: f.id } });
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

  if (!pdfSupported) return null;
  return (
    <>
      <SectionLabel>{t('books.title')}</SectionLabel>
      <Group>
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
        {t('books.hintEmpty')}
      </Txt>
    </>
  );
}
