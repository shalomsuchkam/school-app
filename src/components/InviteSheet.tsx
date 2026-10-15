import { useEffect, useState } from 'react';
import { Clipboard, Platform, Share, StyleSheet, View } from 'react-native';

import { api, type Role } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { radius, usePalette } from '@/lib/theme';

import { Btn, haptic, Sheet, Skeleton, Txt } from './ui';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const TRACKING = 8;

export function InviteSheet({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const p = usePalette();
  const t = useT();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!role) return;
    let alive = true;
    api
      .invite(role)
      .then((r) => alive && setCode(r.code))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
      setCode(null);
      setError(null);
      setCopied(false);
    };
  }, [role]);
  // "Copied" confirmation reverts to the normal label after a moment
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = () => {
    if (!code) return;
    try {
      Clipboard.setString(code);
      haptic.success();
      setCopied(true);
    } catch {
      // clipboard unavailable: the code stays selectable and shareable
    }
  };
  return (
    <Sheet visible={!!role} title={role === 'child' ? t('parent.settings.inviteChild') : t('parent.settings.inviteParent')} onClose={onClose}>
      <Txt v="callout" color={p.muted}>
        {role === 'child' ? t('parent.invite.textChild') : t('parent.invite.textParent')}
      </Txt>
      <View style={[styles.box, { backgroundColor: p.brandSoft }]}>
        <Txt v="caps" color={p.brand} style={{ textTransform: 'uppercase', marginBottom: 10 }}>
          {t('common.inviteCode')}
        </Txt>
        {code ? (
          <Txt
            v="largeTitle"
            color={p.brand}
            selectable
            adjustsFontSizeToFit
            numberOfLines={1}
            accessibilityLabel={code.split('').join(' ')}
            // trailing tracking is added after the last glyph too: pad the start so the code stays optically centred
            style={[styles.code, { fontFamily: MONO, paddingLeft: TRACKING }]}
          >
            {code}
          </Txt>
        ) : error ? (
          <Txt v="callout" color={p.bad} style={{ textAlign: 'center' }}>
            {error}
          </Txt>
        ) : (
          <Skeleton width={210} height={48} r={12} />
        )}
      </View>
      <Txt v="sub" color={p.muted} style={{ textAlign: 'center' }}>
        {t('parent.invite.oneTime')}
      </Txt>
      {code ? (
        <View style={styles.actions}>
          <Btn
            title={copied ? t('common.copied') : t('common.copy')}
            icon={copied ? 'checkmark' : 'copy-outline'}
            kind="secondary"
            style={{ flex: 1 }}
            onPress={copy}
          />
          <Btn
            title={t('parent.invite.send')}
            icon="share-outline"
            style={{ flex: 1 }}
            onPress={() => Share.share({ message: t('parent.invite.share', { code }) })}
          />
        </View>
      ) : null}
    </Sheet>
  );
}
const styles = StyleSheet.create({
  box: { borderRadius: radius.l, paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', marginVertical: 16 },
  code: { fontSize: 40, lineHeight: 50, letterSpacing: TRACKING, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
