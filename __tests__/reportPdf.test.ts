import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { api, type Report } from '@/lib/api';
import { setLang, t } from '@/lib/i18n';
import { dateWithYear, escapeHtml, reportHtml, shareReportPdf } from '@/lib/reportPdf';

import { LANGS } from './helpers';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: jest.fn().mockImplementation((...parts: string[]) => ({ uri: parts.join('/'), exists: false, delete: jest.fn(), moveSync: jest.fn() })),
}));

const REPORT: Report = {
  child_id: 7,
  child_name: '<script>alert("x")</script> & Co',
  from: '2026-09-17',
  to: '2026-10-16',
  days: [
    { date: '2026-10-15', total: 4, on_time: 3, late: 1, skipped: 0, missed: 0, minutes: 75 },
    { date: '2026-10-16', total: 0, on_time: 0, late: 0, skipped: 0, missed: 0, minutes: null },
  ],
  subjects: [{ title: 'Алгебра <b>', emoji: '📐', total: 4, onTime: 3, late: 1, skipped: 0, missed: 0 }],
  totals: { total: 4, on_time: 3, late: 1, skipped: 0, missed: 0 },
  streak: 2,
  perfect_week: 1,
};

afterAll(() => setLang('ru'));

describe('PDF report HTML', () => {
  it('escapes everything that came from the family', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    const html = reportHtml(REPORT);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Алгебра <b>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co');
    expect(html).toContain('Алгебра &lt;b&gt;');
  });

  it.each(LANGS)('is fully localized (%s): headings, period with the year, per-subject and per-day tables', async (lang) => {
    await setLang(lang);
    const html = reportHtml(REPORT, new Date(2026, 9, 16));
    expect(html).toContain(`<html lang="${lang}">`);
    for (const k of ['parent.pdf.title', 'parent.pdf.totals', 'parent.report.bySubject', 'parent.report.byDay', 'parent.pdf.subject', 'parent.pdf.day', 'parent.report.onTime', 'parent.report.missed'])
      expect(html).toContain(escapeHtml(t(k)));
    expect(html).toContain(escapeHtml(t('parent.pdf.period', { from: dateWithYear('2026-09-17'), to: dateWithYear('2026-10-16') })));
    expect(dateWithYear('2026-09-17')).toContain('2026');
    // a minutes column only when the family tracks time
    expect(html).toContain(escapeHtml(t('parent.pdf.minutes')));
    expect(reportHtml({ ...REPORT, days: REPORT.days.map((d) => ({ ...d, minutes: null })) })).not.toContain(`<th>${escapeHtml(t('parent.pdf.minutes'))}</th>`);
  });

  it('shares the printed file as a PDF', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
    jest.mocked(Print.printToFileAsync).mockResolvedValue({ uri: 'file:///cache/print.pdf', numberOfPages: 1 });
    await shareReportPdf(REPORT);
    expect(Print.printToFileAsync).toHaveBeenCalledWith(expect.objectContaining({ width: 595, height: 842, html: expect.stringContaining('<!DOCTYPE html>') }));
    expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringMatching(/\.pdf$/), expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }));
  });

  it('turns failures into translated messages', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
    await expect(shareReportPdf(REPORT)).rejects.toThrow(t('parent.pdf.shareUnavailable'));
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
    jest.mocked(Print.printToFileAsync).mockRejectedValue(new Error('native'));
    await expect(shareReportPdf(REPORT)).rejects.toThrow(t('parent.pdf.fail'));
  });
});

describe('api.report', () => {
  it('sends the child and a clamped period length', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, headers: { get: () => null }, json: () => Promise.resolve(REPORT) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await api.report(7, 30);
    await api.report(undefined, 90);
    await api.report();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]).replace(/^.*\/parent\/report/, ''));
    expect(urls).toEqual(['?child=7&days=30', '?days=31', '']);
  });
});
