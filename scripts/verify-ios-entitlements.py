"""Check capabilities actually claimed by signed executables, not just profiles."""
import argparse
import json
import plistlib
import struct
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('ipa')
parser.add_argument('--screen-time', action='store_true')
parser.add_argument('--push', action='store_true')
args = parser.parse_args()
results = []
expected = {'kz.uroki.app'}
if args.screen_time:
    expected.update('kz.uroki.app.' + n for n in
                    ('ActivityMonitorExtension', 'ShieldAction', 'ShieldConfiguration'))
with zipfile.ZipFile(args.ipa) as archive:
    for name in archive.namelist():
        if not name.endswith('/Info.plist') or not (name.count('/') == 2 or '.appex/Info.plist' in name):
            continue
        info = plistlib.loads(archive.read(name))
        bundle = info['CFBundleIdentifier']
        binary = archive.read(name[:-len('Info.plist')] + info['CFBundleExecutable'])
        offset = binary.find(bytes.fromhex('fade7171'))
        if offset < 0:
            raise RuntimeError('Missing code-signature entitlements: ' + bundle)
        length = struct.unpack('>I', binary[offset + 4:offset + 8])[0]
        entitlements = plistlib.loads(binary[offset + 8:offset + length])
        if args.screen_time:
            if entitlements.get('com.apple.developer.family-controls') is not True:
                raise RuntimeError('Family Controls missing from signature: ' + bundle)
            if 'group.kz.uroki.app' not in entitlements.get('com.apple.security.application-groups', []):
                raise RuntimeError('App Group missing from signature: ' + bundle)
        if args.push and bundle == 'kz.uroki.app' and entitlements.get('aps-environment') != 'production':
            raise RuntimeError('Production APNs missing from signature')
        results.append({'bundle': bundle, 'build': info['CFBundleVersion'],
                        'familyControls': entitlements.get('com.apple.developer.family-controls'),
                        'groups': entitlements.get('com.apple.security.application-groups'),
                        'push': entitlements.get('aps-environment')})
if {r['bundle'] for r in results} != expected:
    raise RuntimeError('Unexpected signed bundle set')
print(json.dumps(results, indent=2))
print('SIGNED_CAPABILITIES_VERIFIED')
