import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

if (process.env.EAS_BUILD_PLATFORM !== 'ios') process.exit(0);
const build = process.env.BUILD_NUMBER;
if (!/^\d+$/.test(build ?? '')) throw new Error('Exact build number is required for the signing audit');
const files = new Set();
async function scan(folder, depth = 0) {
  if (depth > 6) return;
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, item.name);
    if (item.isFile() && item.name.endsWith('.ipa')) files.add(path);
    if (item.isDirectory() && !['node_modules', '.git', '.expo', 'Pods'].includes(item.name)) await scan(path, depth + 1);
  }
}
await scan(process.cwd());
if (process.env.EAS_BUILD_ARTIFACTS_DIR) await scan(resolve(process.env.EAS_BUILD_ARTIFACTS_DIR));
if (files.size !== 1) throw new Error('Expected one exported IPA for the final signing audit');
execFileSync('python3', [fileURLToPath(new URL('./audit-ios-distribution.py', import.meta.url)), [...files][0], build], { stdio: 'inherit' });
console.log('EAS_SIGNED_IPA_AUDIT_COMPLETE', build);
