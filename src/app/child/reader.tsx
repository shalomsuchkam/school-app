import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { Empty, Icon, IconBtn, Txt, useToast } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { httpHost, sameSite } from '@/lib/screenTime';
import { hairline, space, usePalette } from '@/lib/theme';

// In-app textbook viewer. A link stays on its own site (other hosts and non-http schemes are refused), so the
// shelf never turns into a general browser while screen time is on. `pdf` = a local file:// copy (iOS only:
// Android's WebView cannot render PDFs, the shelf opens those in a PDF app instead).
export default function Reader() {
  const p = usePalette();
  const t = useT();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { url, pdf, title } = useLocalSearchParams<{ url?: string; pdf?: string; title?: string }>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const web = useRef<WebView>(null);
  const lastBlock = useRef(0);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/child'));

  const isPdf = !!pdf && pdf.startsWith('file://');
  const link = !isPdf && url && httpHost(url) ? url : null;
  const source = isPdf ? pdf : link;

  const allow = (req: WebViewNavigation) => {
    if (isPdf) return req.url === pdf || req.url === 'about:blank';
    if (link && sameSite(link, req.url)) return true;
    // a blocked link click: say so once in a while instead of doing nothing silently
    if (Date.now() - lastBlock.current > 3000) {
      lastBlock.current = Date.now();
      toast.show(t('books.blocked'));
    }
    return false;
  };

  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <View style={[styles.bar, { borderColor: p.line, backgroundColor: p.bgElevated }]}>
        <IconBtn icon="close" label={t('common.close')} onPress={close} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="headline" numberOfLines={1}>
            {title || t('books.title')}
          </Txt>
          {link ? (
            <View style={styles.host}>
              <Icon name="lock-closed" size={12} color={p.muted} />
              <Txt v="sub" color={p.muted} numberOfLines={1}>
                {httpHost(link)}
              </Txt>
            </View>
          ) : null}
        </View>
        {link ? <IconBtn icon="refresh" label={t('common.retry')} onPress={() => web.current?.reload()} /> : null}
      </View>
      {!source || failed || Platform.OS === 'web' ? (
        <View style={styles.center}>
          <Empty icon="book-outline" title={t('books.openFail')} text={Platform.OS === 'web' ? t('books.phoneOnly') : undefined} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            ref={web}
            source={{ uri: source }}
            originWhitelist={isPdf ? ['file://*'] : ['http://*', 'https://*', 'about:*']}
            onShouldStartLoadWithRequest={allow}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            allowFileAccess={isPdf}
            allowingReadAccessToURL={isPdf ? pdf : undefined}
            allowsBackForwardNavigationGestures
            sharedCookiesEnabled={false}
            domStorageEnabled
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
      {toast.node}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m, paddingVertical: space.xs, borderBottomWidth: hairline },
  host: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.l },
});
