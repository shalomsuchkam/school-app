import { useEffect, useState } from 'react';
import { Clipboard, Platform, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { api, type Invite, type Role } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { palettes, radius, space, usePalette } from '@/lib/theme';

import { Btn, haptic, Sheet, Skeleton, Txt } from './ui';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const TRACKING = 8;
const QR = 184;

const TITLE: Record<Role, string> = { child: 'parent.settings.inviteChild', parent: 'parent.settings.inviteParent', viewer: 'parent.viewers.invite' };
const TEXT: Record<Role, string> = { child: 'parent.invite.textChild', parent: 'parent.invite.textParent', viewer: 'parent.invite.textViewer' };

// childId (with its name) ties a child's code to one of several children; without it the server uses the first child.
// title/text (i18n keys) replace the role's defaults, e.g. for another device of a child who already has one.
// The QR code holds the invite link (a small web page that opens the app at the join screen with the code filled in);
// the 6-character code below works on its own too.
export function InviteSheet({
  role, childId, childName, title, text, onClose,
}: { role: Role | null; childId?: number; childName?: string; title?: string; text?: string; onClose: () => void }) {
  const p = usePalette();
  const t = useT();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // keeps the last role while the sheet slides away
  const [shownRole, setShownRole] = useState<Role>('child');
  if (role && role !== shownRole) setShownRole(role);
  useEffect(() => {
    if (!role) return;
    let alive = true;
    api
      .invite(role, role === 'child' ? childId : undefined)
      .then((r) => alive && setInvite(r))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
      setInvite(null);
      setError(null);
      setCopied(false);
    };
  }, [role, childId]);
  // "Copied" confirmation reverts to the normal label after a moment
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);
  const code = invite?.code ?? null;
  const url = invite?.url ?? null;
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
  const share = () => {
    if (!code) return;
    const message = url ? t('parent.invite.shareLink', { code, url }) : t('parent.invite.share', { code });
    // iOS shows the link as a rich preview when passed as `url`; Android reads `message` only
    Share.share(Platform.OS === 'ios' && url ? { message, url } : { message }).catch(() => {});
  };
  // a QR code needs dark modules on a light ground in both schemes for phone cameras to read it
  const qrInk = palettes.light.ink;
  const qrPaper = palettes.light.card;
  return (
    <Sheet visible={!!role} title={t(title ?? TITLE[shownRole])} onClose={onClose}>
      <Txt v="callout" color={p.muted}>
        {t(text ?? TEXT[shownRole])}
      </Txt>
      {url ? (
        <View style={styles.qrWrap}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('parent.invite.qrA11y')}
            style={[styles.qr, { backgroundColor: qrPaper, borderColor: p.line }]}
          >
            <QRCode value={url} size={QR} color={qrInk} backgroundColor={qrPaper} ecl="M" quietZone={0} />
          </View>
          <Txt v="sub" color={p.muted} style={{ textAlign: 'center', marginTop: space.xs }}>
            {t('parent.invite.scan')}
          </Txt>
        </View>
      ) : !code && !error ? (
        <View style={styles.qrWrap}>
          <Skeleton width={QR + 24} height={QR + 24} r={radius.l} />
        </View>
      ) : null}
      <View style={[styles.box, { backgroundColor: p.brandSoft }]}>
        <Txt v="sub" color={p.brand} style={{ fontWeight: '600', marginBottom: 10 }}>
          {shownRole === 'child' && childName ? t('parent.invite.codeFor', { name: childName }) : t('common.inviteCode')}
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
          <Btn title={copied ? t('common.copied') : t('common.copy')} icon={copied ? 'checkmark' : 'copy-outline'} kind="secondary" style={{ flex: 1 }} onPress={copy} />
          <Btn title={t('parent.invite.send')} icon="share-outline" style={{ flex: 1 }} onPress={share} />
        </View>
      ) : null}
    </Sheet>
  );
}
const styles = StyleSheet.create({
  qrWrap: { alignItems: 'center', marginTop: space.m },
  qr: { padding: 12, borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth },
  box: { borderRadius: radius.l, paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center', marginVertical: 16 },
  code: { fontSize: 40, lineHeight: 50, letterSpacing: TRACKING, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
