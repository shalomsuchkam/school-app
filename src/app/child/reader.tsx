import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { Empty, IconBtn, Txt } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { listPdfs, pdfUri, type LocalPdf } from '@/lib/pdfShelf';
import { allowPdfNavigation, selectedPdf } from '@/lib/pdfReader';
import { hairline, space, usePalette } from '@/lib/theme';

// Local PDFs explicitly selected by the user. Legacy remote URLs are not accepted.
export default function Reader() {
  const { pdfId } = useLocalSearchParams<{ pdfId?: string }>();
  return <LocalReader key={pdfId} pdfId={pdfId} />;
}

function LocalReader({ pdfId }: { pdfId?: string }) {
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<LocalPdf | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [resolved, setResolved] = useState(false);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/child'));
  useEffect(() => {
    let active = true;
    listPdfs().then((list) => {
      if (active) setSelected(selectedPdf(list, pdfId));
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setResolved(true); });
    return () => { active = false; };
  }, [pdfId]);
  const source = selected ? pdfUri(selected) : null;
  const allow = (req: WebViewNavigation) => !!source && allowPdfNavigation(source, req.url);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <View style={[styles.bar, { borderColor: p.line, backgroundColor: p.bgElevated }]}>
        <IconBtn icon="close" label={t('common.close')} onPress={close} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="headline" numberOfLines={1}>
            {selected?.title || t('books.title')}
          </Txt>
        </View>
      </View>
      {!resolved ? (
        <View style={[styles.center, { flex: 1 }]}><ActivityIndicator color={p.brand} /></View>
      ) : !source || failed || Platform.OS === 'web' ? (
        <View style={styles.center}>
          <Empty icon="book-outline" title={t('books.openFail')} text={Platform.OS === 'web' ? t('books.phoneOnly') : undefined} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            source={{ uri: source }}
            // Keep every navigation in the callback so blocked links are not handed to the OS browser.
            originWhitelist={['*']}
            onShouldStartLoadWithRequest={allow}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            allowFileAccess
            allowingReadAccessToURL={source}
            allowsBackForwardNavigationGestures
            sharedCookiesEnabled={false}
            javaScriptEnabled={false}
            domStorageEnabled={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            onLoadEnd={() => setLoading(false)}
            onError={() => setFailed(true)}
            style={{ flex: 1, backgroundColor: p.bg }}
          />
          {loading ? (
            <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
              <ActivityIndicator color={p.brand} />
            </View>
          ) : null}
        </View>
      )}
      <View style={{ height: insets.bottom, backgroundColor: p.bgElevated }} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m, paddingVertical: space.xs, borderBottomWidth: hairline },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.l },
});
