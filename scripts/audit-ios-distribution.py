"""Read-only macOS audit of an exported IPA using Apple's signature tools."""
import datetime
import hashlib
import json
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import zipfile

ipa = Path(sys.argv[1])
expected_build = sys.argv[2]
team = 'WP7NWWX4RS'
expected = {'kz.uroki.app'} | {
    'kz.uroki.app.' + name for name in
    ('ActivityMonitorExtension', 'ShieldAction', 'ShieldConfiguration')}
report = {'build': expected_build, 'sha256': hashlib.sha256(ipa.read_bytes()).hexdigest(), 'bundles': []}

def run(*args):
    return subprocess.check_output(args, stderr=subprocess.PIPE)

with tempfile.TemporaryDirectory() as folder:
    with zipfile.ZipFile(ipa) as archive:
        archive.extractall(folder)
    apps = list((Path(folder) / 'Payload').glob('*.app'))
    assert len(apps) == 1, 'Expected one app'
    app = apps[0]
    run('codesign', '--verify', '--deep', '--strict', '--verbose=2', str(app))
    for bundle in [app, *sorted((app / 'PlugIns').glob('*.appex'))]:
        info = plistlib.loads((bundle / 'Info.plist').read_bytes())
        identifier = info['CFBundleIdentifier']
        assert info['CFBundleVersion'] == expected_build, 'Unexpected build'
        signature = plistlib.loads(run('codesign', '--display', '--entitlements', ':-', str(bundle)))
        profile = plistlib.loads(run('security', 'cms', '-D', '-i', str(bundle / 'embedded.mobileprovision')))
        profile_ent = profile['Entitlements']
        assert profile['ExpirationDate'] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), 'Expired profile'
        assert 'ProvisionedDevices' not in profile and not profile.get('ProvisionsAllDevices'), 'Not App Store distribution'
        for source in [signature, profile_ent]:
            assert source.get('com.apple.developer.family-controls') is True, 'Missing Family Controls'
            assert source.get('application-identifier') == team + '.' + identifier, 'Wrong application identifier'
            assert source.get('com.apple.developer.team-identifier') == team, 'Wrong team'
            assert source.get('get-task-allow') is False, 'Debug signing'
            assert 'group.kz.uroki.app' in source.get('com.apple.security.application-groups', []), 'Missing App Group'
        if identifier == 'kz.uroki.app':
            assert signature.get('aps-environment') == profile_ent.get('aps-environment') == 'production', 'Nonproduction push'
        report['bundles'].append({'identifier': identifier, 'signatureFamilyControls': True,
                                  'profileFamilyControls': True, 'appStoreProfile': True,
                                  'profileExpires': profile['ExpirationDate'].isoformat()})
    assert {item['identifier'] for item in report['bundles']} == expected, 'Unexpected bundle set'
report['appleCodesignStrictVerification'] = True
Path('ios-distribution-' + expected_build + '.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
print('APPLE_DISTRIBUTION_AUDIT_PASSED', expected_build)
