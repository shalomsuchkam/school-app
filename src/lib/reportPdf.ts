import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { Report } from './api';
import { duration, localIso, shortDate } from './format';
import { getLang, t, ta, tn } from './i18n';

// Printable monthly report for parents: plain HTML rendered to PDF on the device (expo-print), then shared.
// Everything that came from the family (child name, subject titles, emoji) is escaped before it goes into the HTML.
export const PDF_DAYS = 30;

export const escapeHtml = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

// "1 сентября 2026" / "2026 ж. 1 қыркүйек" / "1 September 2026", in the interface language.
export function dateWithYear(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return t('parent.pdf.date', { d: d.getDate(), mon: ta('common.monLong')[d.getMonth()] ?? '', y: d.getFullYear() });
}

type Kind = 'on_time' | 'late' | 'skipped' | 'missed';
const KINDS: Kind[] = ['on_time', 'late', 'skipped', 'missed'];
const LABEL: Record<Kind, string> = { on_time: 'parent.report.onTime', late: 'parent.report.late', skipped: 'parent.report.skipped', missed: 'parent.report.missed' };
const COLOR: Record<Kind, string> = { on_time: '#0B8566', late: '#B86E00', skipped: '#6B6789', missed: '#D7343A' };

export function reportHtml(r: Report, generated: Date = new Date()) {
  const e = escapeHtml;
  const num = (n: number) => (n ? e(n) : '–');
  const mins = r.days.filter((d) => d.minutes !== null);
  const avg = mins.length ? Math.round(mins.reduce((s, d) => s + (d.minutes ?? 0), 0) / mins.length) : null;
  const head = (first: string) => `<tr><th class="l">${e(first)}</th><th>${e(t('parent.pdf.total'))}</th>${KINDS.map((k) => `<th>${e(t(LABEL[k]))}</th>`).join('')}`;
  // most problems first, as on the screen
  const score = (s: Report['subjects'][number]) => s.missed * 100 + s.late * 10 + s.skipped;
  const subjects = [...r.subjects].sort((a, b) => score(b) - score(a) || b.total - a.total || a.title.localeCompare(b.title));

  const tiles = [
    `<div class="tile"><b>${e(r.totals.total)}</b><span>${e(t('parent.pdf.total'))}</span></div>`,
    ...KINDS.map((k) => `<div class="tile"><b style="color:${COLOR[k]}">${e(r.totals[k])}</b><span>${e(t(LABEL[k]))}</span></div>`),
  ].join('');

  const subjectRows = subjects
    .map(
      (s) =>
        `<tr><td class="l">${e(`${s.emoji ? `${s.emoji} ` : ''}${s.title}`)}</td><td>${e(s.total)}</td><td>${num(s.onTime)}</td><td>${num(s.late)}</td><td>${num(s.skipped)}</td><td>${num(s.missed)}</td></tr>`,
    )
    .join('');

  const dayRows = r.days
    .map(
      (d) =>
        `<tr${d.total ? '' : ' class="off"'}><td class="l">${e(shortDate(d.date))}</td><td>${num(d.total)}</td>${KINDS.map((k) => `<td>${num(d[k])}</td>`).join('')}${
          mins.length ? `<td>${d.minutes !== null ? e(duration(d.minutes)) : '–'}</td>` : ''
        }</tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="${getLang()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(t('parent.pdf.title'))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Roboto, Arial, sans-serif; color: #17142E; margin: 0; padding: 28px 32px; font-size: 11pt; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #5A4BEF; padding-bottom: 10px; margin-bottom: 16px; }
  .brand { color: #5A4BEF; font-weight: 800; font-size: 20pt; }
  .meta { text-align: right; color: #3D3A57; line-height: 1.5; }
  h1 { font-size: 15pt; margin: 0 0 4px; }
  h2 { font-size: 12pt; margin: 22px 0 8px; color: #3D3A57; text-transform: uppercase; letter-spacing: 0.5px; }
  .tiles { display: flex; gap: 8px; margin: 12px 0 6px; }
  .tile { flex: 1; border: 1px solid #E2DEEF; border-radius: 10px; padding: 8px 10px; }
  .tile b { display: block; font-size: 17pt; }
  .tile span { color: #6B6789; font-size: 9pt; }
  .note { color: #3D3A57; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: #EFECF8; font-weight: 700; padding: 6px 8px; text-align: right; }
  td { padding: 5px 8px; border-bottom: 1px solid #E2DEEF; text-align: right; font-variant-numeric: tabular-nums; }
  .l { text-align: left; }
  tr.off td { color: #9E9AC4; }
  footer { margin-top: 24px; color: #6B6789; font-size: 9pt; }
</style>
</head>
<body>
<header>
  <div><div class="brand">${e(t('onboarding.welcome.brand'))}</div><h1>${e(t('parent.pdf.title'))}</h1></div>
  <div class="meta">${e(t('parent.pdf.child', { name: r.child_name }))}<br>${e(t('parent.pdf.period', { from: dateWithYear(r.from), to: dateWithYear(r.to) }))}</div>
</header>
<h2>${e(t('parent.pdf.totals'))}</h2>
<div class="tiles">${tiles}</div>
<p class="note">${e(tn('parent.report.streak', r.streak))} · ${e(t('parent.report.perfect', { n: r.perfect_week }))}</p>
${avg !== null ? `<p class="note">${e(t('parent.report.avg', { d: duration(avg) }))}</p>` : ''}
${
  subjects.length
    ? `<h2>${e(t('parent.report.bySubject'))}</h2>
<table><thead>${head(t('parent.pdf.subject'))}</tr></thead><tbody>${subjectRows}</tbody></table>`
    : ''
}
<h2>${e(t('parent.report.byDay'))}</h2>
${
  r.days.length
    ? `<table><thead>${head(t('parent.pdf.day'))}${mins.length ? `<th>${e(t('parent.pdf.minutes'))}</th>` : ''}</tr></thead><tbody>${dayRows}</tbody></table>`
    : `<p class="note">${e(t('parent.report.emptyText'))}</p>`
}
<footer>${e(t('parent.pdf.generated', { date: dateWithYear(localIso(generated)) }))}</footer>
</body>
</html>`;
}

// Renders the report to a PDF in the cache and opens the system share sheet.
// Throws an Error with a translated message; cancelling the share sheet is not an error.
export async function shareReportPdf(r: Report) {
  if (!(await Sharing.isAvailableAsync().catch(() => false))) throw new Error(t('parent.pdf.shareUnavailable'));
  let uri: string;
  try {
    // A4 at 72 PPI
    const out = await Print.printToFileAsync({ html: reportHtml(r), width: 595, height: 842 });
    uri = out.uri;
    // a readable file name in the share sheet instead of a random one (no user text in it)
    try {
      const named = new File(Paths.cache, `uroki-report-${`${r.from}_${r.to}`.replace(/[^0-9_-]/g, '')}.pdf`);
      if (named.exists) named.delete();
      new File(uri).moveSync(named);
      uri = named.uri;
    } catch {}
  } catch {
    throw new Error(t('parent.pdf.fail'));
  }
  try {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: t('parent.pdf.dialog') });
  } catch {
    throw new Error(t('parent.pdf.fail'));
  }
}
