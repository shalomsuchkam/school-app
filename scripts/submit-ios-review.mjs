import { createPrivateKey, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const APP = '6827758955';
const REPO = 'shalomsuchkam/school-app';
const VERSION = '1.0.0';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition, message) => { if (!condition) throw new Error(message); };

export function verifyRun(run, jobs, expected) {
  check(run.repository?.full_name === REPO, 'Unexpected repository');
  check(run.head_sha === expected.sha, 'Build source does not match requested commit');
  check(String(run.run_number) === expected.build, 'Build number mismatch');
  check(run.path === '.github/workflows/build.yml', 'Unexpected build workflow');
  check(run.status === 'completed' && run.conclusion === 'success', 'Build is not successful');
  for (const name of ['test', 'android', 'ios']) {
    check(jobs.some((job) => job.name === name && job.conclusion === 'success'), `Required job failed or missing: ${name}`);
  }
}

export function verifyApp(app, version, build, expectedBuild) {
  check(app.id === APP && app.attributes.bundleId === 'kz.uroki.app', 'Unexpected Apple app');
  check(app.attributes.contentRightsDeclaration === 'USES_THIRD_PARTY_CONTENT', 'Saved content-rights declaration is missing');
  check(version.attributes.platform === 'IOS' && version.attributes.versionString === VERSION, 'Unexpected app version');
  check(version.relationships.app.data.id === APP, 'Version belongs to another app');
  check(build.attributes.version === expectedBuild && build.attributes.processingState === 'VALID', 'Requested Apple build is not VALID');
  check(build.relationships.app.data.id === APP, 'Build belongs to another app');
}

export function verifyItems(items, versionId) {
  check(items.length === 1 && items[0].relationships?.appStoreVersion?.data?.id === versionId,
    'Submission must contain only the requested app version');
}

export function verifyResubmission(candidate, items, versionId, authorizedId) {
  verifyItems(items, versionId);
  check(candidate.id === authorizedId && /^[a-f0-9-]{36}$/.test(authorizedId ?? ''), 'Rejected submission was not explicitly selected');
  check(candidate.attributes.state === 'UNRESOLVED_ISSUES', 'Only an unresolved rejected submission can be resolved');
  check(items[0].attributes?.state === 'REJECTED', 'Expected one rejected version item');
}

export function verifyEditableVersion(state, currentBuildId, nextBuildId, rejectedVerified) {
  check(['PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW', 'REJECTED'].includes(state), `Unexpected version state: ${state}`);
  if (state === 'REJECTED') check(rejectedVerified, 'Rejected version requires its explicitly verified review submission');
  if (currentBuildId !== nextBuildId) {
    check(['PREPARE_FOR_SUBMISSION', 'REJECTED'].includes(state), 'Cannot replace build in an existing ready review');
  }
}

async function main() {
  const expected = { build: process.env.RELEASE_BUILD, sha: process.env.EXPECTED_SHA };
  const runId = process.env.BUILD_RUN_ID;
  check(/^\d+$/.test(expected.build ?? '') && /^\d+$/.test(runId ?? ''), 'Invalid build/run input');
  check(/^[a-f0-9]{40}$/.test(expected.sha ?? ''), 'Invalid source commit');
  const github = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(30000),
    });
    check(response.ok, `GitHub request failed: ${response.status}`);
    return response.json();
  };
  let run;
  const deadline = Date.now() + 50 * 60 * 1000;
  while (Date.now() < deadline) {
    run = await github(`actions/runs/${runId}`);
    check(run.head_sha === expected.sha && String(run.run_number) === expected.build, 'Requested build identity changed');
    if (run.status === 'completed') break;
    console.log(`WAIT_BUILD ${expected.build} ${run.status}`);
    await sleep(30000);
  }
  const jobs = (await github(`actions/runs/${runId}/jobs?per_page=100`)).jobs;
  verifyRun(run, jobs, expected);
  const artifacts = (await github(`actions/runs/${runId}/artifacts?per_page=100`)).artifacts;
  check(artifacts.some((item) => item.name === 'ios-signed' && !item.expired), 'Signed iOS artifact missing');
  check(artifacts.some((item) => item.name === 'ios-distribution-audit' && !item.expired), 'Independent Apple distribution signature audit missing');
  console.log(`VERIFIED_BUILD ${expected.build} ${expected.sha}`);

  const key = createPrivateKey(process.env.ASC_KEY_P8);
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const apple = async (path, method = 'GET', payload) => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' })}.${b64({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 300, aud: 'appstoreconnect-v1' })}`;
    const token = `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    const response = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000), ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const raw = await response.text();
    const result = raw ? JSON.parse(raw) : { data: null };
    if (!response.ok) throw new Error(JSON.stringify({ status: response.status, errors: result.errors?.map(({ code, title, detail }) => ({ code, title, detail })) }));
    return result.data;
  };
  const app = await apple(`apps/${APP}`);
  const versions = await apple(`apps/${APP}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${VERSION}&include=app&limit=10`);
  check(versions.length === 1, 'Expected one iOS version');
  const version = versions[0];
  let build;
  const processingDeadline = Date.now() + 25 * 60 * 1000;
  while (Date.now() < processingDeadline) {
    const builds = await apple(`builds?filter[app]=${APP}&filter[version]=${expected.build}&include=app&limit=10`);
    check(builds.length <= 1, 'Ambiguous Apple build');
    build = builds[0];
    if (build?.attributes.processingState === 'VALID') break;
    check(!['FAILED', 'INVALID'].includes(build?.attributes.processingState), 'Apple rejected build processing');
    console.log(`WAIT_APPLE ${expected.build} ${build?.attributes.processingState ?? 'not yet listed'}`);
    await sleep(30000);
  }
  verifyApp(app, version, build ?? { attributes: {} }, expected.build);
  check(Date.parse(build.attributes.uploadedDate) >= Date.parse(run.created_at) - 300000, 'Apple build predates verified CI run');
  if (process.env.SUBMIT_FOR_REVIEW !== 'true') {
    console.log(`SUBMISSION_PREFLIGHT_PASSED ${expected.build} ${version.attributes.appStoreState}`);
    return;
  }
  const current = await apple(`appStoreVersions/${version.id}/build`);
  const state = version.attributes.appStoreState;
  if (['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'READY_FOR_SALE'].includes(state)) {
    check(current?.id === build.id, 'Another build is already submitted; refusing to change it');
    console.log(`ALREADY_SUBMITTED ${expected.build} ${state}`);
    return;
  }
  const notes = process.env.REVIEW_NOTES;
  check(notes?.startsWith(`BUILD ${expected.build} —`), 'Reviewer instructions must describe the requested build');
  let rejectedVerified = false;
  if (state === 'REJECTED') {
    const id = process.env.REJECTED_SUBMISSION_ID;
    check(/^[a-f0-9-]{36}$/.test(id ?? ''), 'Select the exact rejected submission');
    const candidate = await apple(`reviewSubmissions/${id}`);
    const items = await apple(`reviewSubmissions/${id}/items?include=appStoreVersion&limit=200`);
    verifyResubmission(candidate, items, version.id, id);
    rejectedVerified = true;
  }
  verifyEditableVersion(state, current?.id, build.id, rejectedVerified);
  if (current?.id !== build.id) {
    await apple(`appStoreVersions/${version.id}/relationships/build`, 'PATCH', { data: { type: 'builds', id: build.id } });
  }
  const linked = await apple(`appStoreVersions/${version.id}/build`);
  check(linked.id === build.id, 'Build relationship verification failed');
  console.log(`BUILD_LINKED ${expected.build}`);

  const detail = await apple(`appStoreVersions/${version.id}/appStoreReviewDetail`);
  check(detail?.id, 'Reviewer contact/demo instructions missing');
  await apple(`appStoreReviewDetails/${detail.id}`, 'PATCH', { data: { type: 'appStoreReviewDetails', id: detail.id, attributes: { notes } } });
  if (process.env.UPDATE_SOURCE_DESCRIPTION === 'true') {
    const source = await github(`contents/docs/store/ios-description.ru.txt?ref=${expected.sha}`);
    check(source.encoding === 'base64' && typeof source.content === 'string', 'Description is missing from verified build source');
    const description = Buffer.from(source.content, 'base64').toString('utf8').trim();
    check(description.startsWith('«Контроль ДЗ»') && description.length <= 4000, 'Invalid source description');
    const localizations = await apple(`appStoreVersions/${version.id}/appStoreVersionLocalizations`);
    const ru = localizations.filter((item) => item.attributes.locale === 'ru');
    check(ru.length === 1, 'Expected one Russian version localization');
    await apple(`appStoreVersionLocalizations/${ru[0].id}`, 'PATCH', {
      data: { type: 'appStoreVersionLocalizations', id: ru[0].id, attributes: { description } },
    });
    console.log(`SOURCE_DESCRIPTION_SAVED ${expected.sha}`);
  }

  const submissions = await apple(`reviewSubmissions?filter[app]=${APP}&filter[platform]=IOS&limit=200`);
  let submission;
  for (const candidate of submissions.filter((s) => s.attributes.state !== 'COMPLETE')) {
    const items = await apple(`reviewSubmissions/${candidate.id}/items?include=appStoreVersion&limit=200`);
    if (items.some((item) => item.relationships?.appStoreVersion?.data?.id === version.id)) {
      verifyItems(items, version.id);
      if (candidate.attributes.state === 'UNRESOLVED_ISSUES') {
        verifyResubmission(candidate, items, version.id, process.env.REJECTED_SUBMISSION_ID);
        await apple(`reviewSubmissionItems/${items[0].id}`, 'PATCH', {
          data: { type: 'reviewSubmissionItems', id: items[0].id, attributes: { resolved: true } },
        });
        const resolved = await apple(`reviewSubmissions/${candidate.id}/items?include=appStoreVersion&limit=200`);
        verifyItems(resolved, version.id);
        check(resolved[0].attributes.state === 'READY_FOR_REVIEW', 'Rejected item did not become ready for review');
        console.log(`REJECTED_ITEM_RESOLVED ${candidate.id}`);
      } else {
        check(candidate.attributes.state === 'READY_FOR_REVIEW', `Existing submission needs attention: ${candidate.attributes.state}`);
      }
      check(!submission, 'Multiple draft submissions contain this version');
      submission = candidate;
    }
  }
  if (!submission) {
    submission = await apple('reviewSubmissions', 'POST', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP } } } } });
    await apple('reviewSubmissionItems', 'POST', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } });
  }
  verifyItems(await apple(`reviewSubmissions/${submission.id}/items?include=appStoreVersion&limit=200`), version.id);
  await apple(`reviewSubmissions/${submission.id}`, 'PATCH', { data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } } });
  const verified = await apple(`reviewSubmissions/${submission.id}`);
  check(['WAITING_FOR_REVIEW', 'IN_REVIEW', 'COMPLETING', 'COMPLETE'].includes(verified.attributes.state), `Submission was not accepted: ${verified.attributes.state}`);
  console.log(`REVIEW_SUBMITTED ${expected.build} ${verified.id} ${verified.attributes.state}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
