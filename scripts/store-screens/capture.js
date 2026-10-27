// Captures the app screens for store screenshots from the web export with a mocked API (no server needed).
// usage: node capture.js <baseUrl> <outDir> [width height dpr lang]   e.g. iPhone: 430 932 3, iPad: 1024 1366 2
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [, , BASE = 'http://localhost:8085', OUT = '.', W = '430', H = '932', DPR = '3', LANG = 'ru'] = process.argv;

const TODAY = '2026-10-17';
const ACTIVE = '2026-10-19';
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const task = (o) => ({
  kind: 'lesson', light: false, needs_photo: true, required: true, status: 'todo', skip_reason: null, accepted: false,
  done_at: null, done_hm: null, note: null, parent_comment: null, photos: [], category: 'school', duration_min: null, messages: 0, voice_url: null, ...o,
});
const tasks = [
  task({ id: 901, label: 'Математика', emoji: '📐', status: 'done', done_hm: '17:40', note: 'Стр. 42, № 5 и 6', messages: 2, voice_url: 'https://example.invalid/v.m4a' }),
  task({ id: 902, label: 'Русский язык', emoji: '📖', note: 'Упр. 118' }),
  task({ id: 903, label: 'Познание мира', emoji: '🌍', light: true }),
  task({ id: 904, kind: 'item', label: 'Форма на физру', emoji: '👕', needs_photo: false, status: 'done' }),
  task({ id: 905, kind: 'item', label: 'Вынести мусор', emoji: '🗑', needs_photo: false, category: 'home', duration_min: 5, messages: 1 }),
  task({ id: 906, kind: 'item', label: 'Полить цветы', emoji: '🪴', needs_photo: false, category: 'home', duration_min: 10, required: false }),
];
const subjects = [
  { id: 1, name: 'Математика', emoji: '📐', light: false },
  { id: 2, name: 'Русский язык', emoji: '📖', light: false },
  { id: 3, name: 'Казахский язык', emoji: '🇰🇿', light: false },
  { id: 4, name: 'Познание мира', emoji: '🌍', light: true },
  { id: 5, name: 'Английский', emoji: '🇬🇧', light: false },
  { id: 6, name: 'Физкультура', emoji: '⚽', light: true },
];
const family = {
  id: 'f1', code: 'FAM123', child_name: 'Айгерим', photo_retention_days: 14, country: 'KZ', lang: 'ru', reward_goal: null, reward_text: null,
  track_time: false, auto_holidays: true, tz: 'Asia/Almaty', school_weekdays: [1, 2, 3, 4, 5], soft_deadline: '20:00', hard_deadline: '21:30',
  remind_times: ['16:00'], quiet_from: '21:30', quiet_to: '07:00', allow_viewers: true,
};
const me = {
  device: { id: 'd1', role: 'parent', name: 'Мама', child_id: null },
  family,
  children: [{ id: 12, name: 'Айгерим', pos: 0 }],
  access: { active: true, billing: false, free_forever: true, paid_until: null, granted_until: null, trial: false, store: null },
  members: [
    { id: 'd1', role: 'parent', name: 'Мама', telegram: false, me: true, child_id: null, last_seen: ago(0) },
    { id: 'd2', role: 'parent', name: 'Папа', telegram: true, me: false, child_id: null, last_seen: ago(130) },
    { id: 'd3', role: 'child', name: 'Айгерим', telegram: false, me: false, child_id: 12, last_seen: ago(2) },
    { id: 'd4', role: 'viewer', name: 'Репетитор Алия', telegram: false, me: false, child_id: null, last_seen: ago(60 * 26) },
  ],
  telegram: { enabled: true, bot: 'uroki_bot', linked: false },
};
const overview = {
  child_id: 12, child_name: 'Айгерим', now_hm: '18:10', active: ACTIVE, streak: 4, perfect_week: 1, days_off: [], child_seen: ago(2),
  days: [
    { date: ACTIVE, label: '', total: 4, done: 2, last_done_hm: '17:40', on_time: false, tasks, override_note: 'Сокращённый день: 4 урока' },
    { date: '2026-10-16', label: '', total: 5, done: 5, last_done_hm: '19:20', on_time: true, tasks: tasks.slice(0, 4).map((x) => ({ ...x, status: 'done', done_hm: '19:05' })) },
    { date: '2026-10-15', label: '', total: 5, done: 3, last_done_hm: '21:10', on_time: false, tasks: tasks.slice(0, 4).map((x, i) => ({ ...x, status: i < 3 ? 'done' : 'todo' })) },
  ],
};
const pattern = { 1: 'done_on_time', 2: 'done_on_time', 3: 'done_late', 4: 'off', 5: 'off', 6: 'done_on_time', 7: 'partial', 8: 'done_on_time', 9: 'missed', 10: 'done_on_time', 11: 'off', 12: 'off', 13: 'done_on_time', 14: 'done_on_time', 15: 'partial', 16: 'done_on_time', 17: 'empty', 18: 'off' };
const calendar = (month) => {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    month, child_id: 12,
    days: Array.from({ length: n }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`;
      const wd = new Date(date + 'T00:00:00Z').getUTCDay();
      let status = date > TODAY ? (wd === 0 || wd === 6 ? 'off' : 'future') : month === '2026-10' ? pattern[i + 1] ?? 'done_on_time' : wd === 0 || wd === 6 ? 'off' : ['done_on_time', 'done_late', 'done_on_time', 'partial'][i % 4];
      const total = status === 'off' || status === 'empty' ? 0 : 5;
      const done = status === 'partial' ? 3 : status === 'missed' || status === 'future' ? 0 : total;
      return { date, status, total, done };
    }),
  };
};
const setup = {
  child_id: 12, subjects,
  lessons: { 1: [1, 2, 4, 6], 2: [3, 1, 5], 3: [1, 2, 4], 4: [2, 1, 6], 5: [5, 3, 1] },
  lessons_alt: { 1: {}, 2: {} },
  items: [
    { id: 1, title: 'Форма на физру', emoji: '👕', required: true, needs_photo: false, weekdays: [1, 4], pos: 0, child_id: null, category: 'school', duration_min: null },
    { id: 2, title: 'Вынести мусор', emoji: '🗑', required: true, needs_photo: false, weekdays: null, pos: 1, child_id: null, category: 'home', duration_min: 5 },
    { id: 3, title: 'Полить цветы', emoji: '🪴', required: false, needs_photo: false, weekdays: [3], pos: 2, child_id: null, category: 'home', duration_min: 10 },
  ],
  days_off: [], holidays: ['2026-10-25'],
  overrides: [
    { date: '2026-10-19', subject_ids: [1, 2, 4], note: 'Сокращённый день' },
    { date: '2026-10-23', subject_ids: [], note: 'Экскурсия' },
  ],
};
const messages = [
  { id: 41, role: 'child', name: 'Айгерим', body: 'Не поняла задачу 6, там дроби', created_at: ago(50), mine: false },
  { id: 42, role: 'parent', name: 'Мама', body: 'Посмотри пример на стр. 41 — там то же самое, только с другими числами', created_at: ago(44), mine: true },
  { id: 43, role: 'child', name: 'Айгерим', body: 'Поняла, спасибо! Сфотографировала', created_at: ago(20), mine: false },
];
const childState = {
  name: 'Айгерим', child_id: 12, school_date: ACTIVE, school_label: '', due_date: '2026-10-18', due_label: '', due_today: false, soft: '20:00', hard: '21:30',
  remind_times: ['16:00'], now_hm: '18:10', mins_to_soft: null, mins_to_hard: null, streak: 4, perfect_week: 1, tasks, tz: 'Asia/Almaty', upcoming: [],
  reward: null, track_time: false, started_at: null, override_note: 'Сокращённый день: 4 урока',
};


const minsAgo = ago;
const screenState = {
  rules: { child_id: 12, enabled: true, daily_limit_min: 120,
    app_limits: [{ pkg: 'com.zhiliaoapp.musically', name: 'TikTok', minutes: 30 }, { pkg: 'com.google.android.youtube', name: 'YouTube', minutes: 45 }, { pkg: 'com.roblox.client', name: 'Roblox', minutes: 40 }],
    blocked_apps: [], always_allowed: ['com.whatsapp'],
    bedtime: { from: '21:30', to: '07:00', allowed: [] }, school: { from: '08:00', to: '14:00', days: [1,2,3,4,5], allowed: [] },
    homework_lock: true, homework_lock_from: '15:00', block_new_apps: true, unlock_until: null, updated_at: minsAgo(30) },
  homework_done: false, homework_date: ACTIVE, homework_due_today: false, tz: 'Asia/Almaty',
  textbooks: [{ id: 1, child_id: null, title: 'Математика, 3 класс', url: 'https://okulyk.kz/math3', created_at: minsAgo(9000) }],
  device: { device_id: 'd3', apps: [
      { pkg: 'com.zhiliaoapp.musically', name: 'TikTok' }, { pkg: 'com.google.android.youtube', name: 'YouTube' }, { pkg: 'com.roblox.client', name: 'Roblox' },
      { pkg: 'com.whatsapp', name: 'WhatsApp' }, { pkg: 'com.brawlstars', name: 'Brawl Stars' }],
    usage: { date: TODAY, total_min: 74, apps: { 'com.zhiliaoapp.musically': 22, 'com.google.android.youtube': 31, 'com.roblox.client': 12, 'com.whatsapp': 9 } },
    guard: { usage_access: true, overlay: true, battery_ok: true, running: true }, reported_at: minsAgo(3), approved: ['com.zhiliaoapp.musically','com.google.android.youtube','com.roblox.client','com.whatsapp'] },
  today: TODAY, school_day: false, approved: ['com.zhiliaoapp.musically','com.google.android.youtube','com.roblox.client','com.whatsapp'], new_apps: ['com.brawlstars'], lang: 'ru',
};
const tasksSkip = tasks.map((x) => (x.id === 903 ? { ...x, status: 'skip_pending', skip_reason: 'Не задали' } : x));
function route(path, method) {
  const u = new URL('http://x' + path);
  const p = u.pathname;
  if (p === '/me') return { ...me, children: [{ id: 12, name: 'Айгерим', pos: 0 }, { id: 13, name: 'Тимур', pos: 1 }], access: { active: true, billing: true, free_forever: false, paid_until: '2026-11-24T00:00:00Z', granted_until: null, trial: false, store: 'app_store' } };
  if (p === '/parent/overview') return { ...overview, days: overview.days.map((d, i) => (i === 0 ? { ...d, tasks: tasksSkip, override_note: null } : d)) };
  if (p === '/parent/calendar') return calendar(u.searchParams.get('month') || '2026-10');
  if (p === '/parent/report') return {};
  if (p === '/setup') return setup;
  if (p === '/screen/rules') return screenState;
  if (p === '/textbooks') return screenState.textbooks;
  if (p.startsWith('/tasks/') && p.endsWith('/messages')) return method === 'POST' ? { ...messages[1], id: 99 } : messages;
  if (p === '/invite') return { code: 'K7QMZP', role: 'child', expires_at: '2026-10-19T09:00:00.000Z', url: 'https://api.urokiapp.kz/functions/v1/app/i/K7QMZP' };
  if (p === '/child/state') return { ...childState, override_note: null, streak: 6 };
  return {};
}

(async () => {
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
  const shoot = async ({ name, scheme = 'light', path, role = 'parent', act }) => {
    const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +DPR, colorScheme: scheme, locale: LANG === 'en' ? 'en-US' : LANG === 'kk' ? 'kk-KZ' : 'ru-RU', timezoneId: 'Asia/Almaty' });
    await ctx.addInitScript(([r, l]) => {
      localStorage.setItem('uroki.session.v2', JSON.stringify({ token: 'demo', role: r }));
      localStorage.setItem('uroki.lang', l);
    }, [role, LANG]);
    await ctx.route('**/functions/v1/app/**', async (r) => {
      const url = r.request().url();
      const path = url.slice(url.indexOf('/functions/v1/app') + '/functions/v1/app'.length);
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route(path, r.request().method())) });
    });
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    if (act) await act(page);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await ctx.close();
    console.log('shot', name);
  };
  const jobs = [
    { name: '1-parent-today', path: '/parent' },
    { name: '2-child', path: '/child', role: 'child' },
    { name: '3-screen', path: '/parent/screen' },
    { name: '4-skip', path: '/parent', act: async (p) => { await p.getByText('Познание мира', { exact: true }).first().scrollIntoViewIfNeeded(); await p.mouse.wheel(0, 250); } },
    { name: '5-calendar', path: '/parent/calendar', act: async (p) => { await p.locator('[data-testid="cal-2026-10-15"]').click(); await p.waitForTimeout(300); } },
    { name: '6-chat', path: '/parent', act: async (p) => { await p.getByLabel(/^Чат: Математика/).first().click(); } },
    { name: '7-schedule', path: '/parent/schedule' },
    { name: '8-invite', path: '/parent/settings', act: async (p) => { await p.getByText('Пригласить ученика', { exact: true }).click(); await p.waitForTimeout(600); await p.getByText('Айгерим', { exact: true }).last().click(); } },
  ];
  const only = process.env.ONLY; for (const j of jobs.filter((j) => !only || only.split(',').includes(j.name))) await shoot(j).catch((e) => console.log('FAIL', j.name, e.message.split('\n')[0]));
  await browser.close();
})();
