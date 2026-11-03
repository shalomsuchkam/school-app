"""Preserve configured capabilities before cloud-managed distribution export.

An unsigned archive has no code-signature entitlements for Xcode to carry into
export. Apply an intermediate ad-hoc signature; export replaces it with Apple's
distribution signature and provisioning profiles. This archive is never shipped.
"""
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import tempfile

archive = Path(sys.argv[1])
team = os.environ['APPLE_TEAM_ID']
settings = json.loads(subprocess.check_output([
    'xcodebuild', '-project', 'ios/Uroki.xcodeproj', '-alltargets',
    '-configuration', 'Release', '-showBuildSettings', '-json',
    'CODE_SIGNING_ALLOWED=NO', f'DEVELOPMENT_TEAM={team}',
]))
app = archive / 'Products/Applications/Uroki.app'
targets = []
for entry in settings:
    s = entry['buildSettings']
    ext = s.get('WRAPPER_EXTENSION')
    if ext not in ('app', 'appex'):
        continue
    def expand(value):
        replacements = {**s, 'AppIdentifierPrefix': team + '.', 'TeamIdentifierPrefix': team + '.'}
        return re.sub(r'\$\(([^)]+)\)|\$\{([^}]+)\}',
                      lambda m: replacements[m.group(1) or m.group(2)], value)
    configured = expand(s['CODE_SIGN_ENTITLEMENTS'])
    source = Path(configured)
    if not source.is_absolute():
        source = Path(s['SRCROOT']) / source
    entitlements = plistlib.loads(source.read_bytes())
    entitlements = plistlib.loads(expand(plistlib.dumps(entitlements).decode()).encode())
    bundle = s['PRODUCT_BUNDLE_IDENTIFIER']
    entitlements['application-identifier'] = team + '.' + bundle
    entitlements['com.apple.developer.team-identifier'] = team
    entitlements['get-task-allow'] = False
    if ext == 'app' and 'aps-environment' in entitlements:
        entitlements['aps-environment'] = 'production'
    product = app if ext == 'app' else app / 'PlugIns' / s['FULL_PRODUCT_NAME']
    if not product.exists():
        raise RuntimeError(f'Missing archived product: {product}')
    targets.append((ext, product, entitlements))

# Sign nested executable code first, without applying app capabilities to libraries.
for library in sorted(app.rglob('*'), key=lambda p: len(p.parts), reverse=True):
    if library.suffix in ('.framework', '.dylib'):
        subprocess.run(['codesign', '--force', '--sign', '-', str(library)], check=True)
with tempfile.TemporaryDirectory() as folder:
    for ext, product, entitlements in sorted(targets, key=lambda t: t[0] == 'app'):
        path = Path(folder) / (product.name + '.plist')
        path.write_bytes(plistlib.dumps(entitlements))
        subprocess.run(['codesign', '--force', '--sign', '-', '--entitlements', str(path),
                        '--generate-entitlement-der', str(product)], check=True)
        print('Prepared capability signature:', product.name)
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
