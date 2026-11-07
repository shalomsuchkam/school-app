import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyApp, verifyItems, verifyRun } from './submit-ios-review.mjs';

const expected = { sha: 'a'.repeat(40), build: '68' };
const run = { repository: { full_name: 'shalomsuchkam/school-app' }, head_sha: expected.sha, run_number: 68, path: '.github/workflows/build.yml', status: 'completed', conclusion: 'success' };
const jobs = ['test', 'android', 'ios'].map((name) => ({ name, conclusion: 'success' }));
test('only the exact successful build with both platforms can authorize submission', () => {
  assert.doesNotThrow(() => verifyRun(run, jobs, expected));
  for (const patch of [{ head_sha: 'b'.repeat(40) }, { run_number: 67 }, { conclusion: 'failure' }, { path: '.github/workflows/other.yml' }, { repository: { full_name: 'other/app' } }]) {
    assert.throws(() => verifyRun({ ...run, ...patch }, jobs, expected));
  }
  assert.throws(() => verifyRun(run, jobs.filter((job) => job.name !== 'ios'), expected));
  assert.throws(() => verifyRun(run, jobs.map((job) => ({ ...job, conclusion: 'skipped' })), expected));
});

const app = { id: '6827758955', attributes: { bundleId: 'kz.uroki.app', contentRightsDeclaration: 'USES_THIRD_PARTY_CONTENT' } };
const version = { attributes: { platform: 'IOS', versionString: '1.0.0' }, relationships: { app: { data: { id: app.id } } } };
const build = { attributes: { version: '68', processingState: 'VALID' }, relationships: version.relationships };
test('requires the intended Apple app, valid build and already saved declaration', () => {
  assert.doesNotThrow(() => verifyApp(app, version, build, '68'));
  assert.throws(() => verifyApp({ ...app, attributes: { ...app.attributes, contentRightsDeclaration: null } }, version, build, '68'));
  assert.throws(() => verifyApp(app, version, build, '67'));
  assert.throws(() => verifyApp(app, version, { ...build, attributes: { ...build.attributes, processingState: 'PROCESSING' } }, '68'));
  assert.throws(() => verifyApp(app, version, { ...build, relationships: { app: { data: { id: 'other-app' } } } }, '68'));
});

test('does not submit extra items, another version or an empty review', () => {
  const item = { relationships: { appStoreVersion: { data: { id: 'intended-version' } } } };
  assert.doesNotThrow(() => verifyItems([item], 'intended-version'));
  assert.throws(() => verifyItems([], 'intended-version'));
  assert.throws(() => verifyItems([item, item], 'intended-version'));
  assert.throws(() => verifyItems([item], 'another-version'));
});
