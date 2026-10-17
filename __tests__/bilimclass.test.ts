import { cleanText, mondayOf, eduYearOf, matchSubject, normName, parseBilim, parsePasted, planImport, readMessage, similarity, toIsoDate, READ_DIARY_JS } from '@/lib/bilimclass';

import diary from './fixtures/bilimclass-diary.json';
import homeworks from './fixtures/bilimclass-homeworks.json';
import schedule from './fixtures/bilimclass-schedule.json';

// Fixtures follow the response shapes documented by the public community projects
// (github.com/chelik0002/Bilimclass-API, github.com/ValentinStars/bilimclass-api).
const SUBJECTS = [
  { id: 1, name: 'Математика' },
  { id: 2, name: 'Русский язык' },
  { id: 3, name: 'Казахский язык' },
  { id: 4, name: 'Познание мира' },
  { id: 5, name: 'Английский' },
  { id: 6, name: 'Физкультура' },
];

describe('BilimClass parsing', () => {
  it('reads the weekly diary: dates, subjects, homework text without HTML; skips empty homework', () => {
    const items = parseBilim(diary);
    expect(items).toEqual([
      { date: '2026-10-19', subject: 'Математика', homework: 'Стр. 42, № 5 и 6' },
      { date: '2026-10-19', subject: 'Русский язык', homework: 'Упр. 118\nвыучить правило' },
      { date: '2026-10-19', subject: 'Казахский язык и литература', homework: 'Жаттығу 7' },
      { date: '2026-10-20', subject: 'Познание мира', homework: 'Нарисовать карту двора' },
    ]);
  });

  it('reads the schedule (dateFormat / unix date) and the monthly homework list', () => {
    expect(parseBilim(schedule)).toEqual([{ date: '2026-10-21', subject: 'Английский язык', homework: 'Ex. 3 p. 27' }]);
    expect(parseBilim(homeworks).map((x) => [x.date, x.subject])).toEqual([
      ['2026-10-22', 'Информатика'],
      ['2026-10-22', 'История Казахстана'],
    ]);
  });

  it('merges a list of responses (this week + next week) without duplicates', () => {
    const items = parseBilim([diary, diary, schedule]);
    expect(items).toHaveLength(5);
    expect(items.map((x) => x.date)).toEqual([...items.map((x) => x.date)].sort());
  });

  it('never throws on unexpected shapes', () => {
    for (const bad of [null, undefined, 42, 'html', [], {}, { data: null }, { data: { days: 'x' } }, { data: { days: [null, 1, { subjects: [null, { label: 5 }] }] } }, { data: [{ homeworks: [{}] }] }]) {
      expect(parseBilim(bad)).toEqual([]);
    }
  });

  it('dates: DD.MM.YYYY, ISO and unix seconds / milliseconds in the family zone', () => {
    expect(toIsoDate('5.9.2026')).toBe('2026-09-05');
    expect(toIsoDate('2026-10-21T19:00:00Z')).toBe('2026-10-21');
    // 2026-10-20 19:00 UTC = 21 Oct 00:00 in Almaty (UTC+5)
    expect(toIsoDate(1792522800, 'Asia/Almaty')).toBe('2026-10-21');
    expect(toIsoDate(1792522800000, 'Asia/Almaty')).toBe('2026-10-21');
    expect(toIsoDate('завтра')).toBeNull();
    expect(cleanText('<b>a</b>&amp;b<br/>c')).toBe('a&b\nc');
  });

  it('diary request helpers: Monday of the week and the school year', () => {
    expect(mondayOf(new Date(2026, 9, 22))).toBe('19.10.2026');
    expect(mondayOf(new Date(2026, 9, 25))).toBe('19.10.2026');
    expect(eduYearOf(new Date(2026, 9, 1))).toBe(2026);
    expect(eduYearOf(new Date(2027, 2, 1))).toBe(2026);
  });
});

describe('subject mapping', () => {
  it('fuzzy-matches by lowercased name', () => {
    expect(normName('  Русский   ЯЗЫК! ')).toBe('русский язык');
    expect(similarity('Математика', 'математика')).toBe(1);
    expect(matchSubject('Математика', SUBJECTS)).toBe(1);
    expect(matchSubject('Казахский язык и литература', SUBJECTS)).toBe(3);
    expect(matchSubject('Английский язык', SUBJECTS)).toBe(5);
    expect(matchSubject('Матиматика', SUBJECTS)).toBe(1); // a typo
    expect(matchSubject('Химия', SUBJECTS)).toBeNull();
  });

  it('a remembered choice wins, unless that subject no longer exists', () => {
    expect(matchSubject('Физическая культура', SUBJECTS, { 'физическая культура': 6 })).toBe(6);
    expect(matchSubject('Математика', SUBJECTS, { математика: 99 })).toBe(1);
  });

  it('plans notes only for lessons that exist on the day; merges several items of one subject', () => {
    const tasks = [
      { id: 10, kind: 'lesson', label: 'Математика' },
      { id: 11, kind: 'lesson', label: 'Русский язык' },
      { id: 12, kind: 'item', label: 'Казахский язык' }, // a checklist item never receives homework
    ];
    const items = [...parseBilim(diary), { date: '2026-10-19', subject: 'математика', homework: 'Ещё задача 7' }];
    const plan = planImport(items, '2026-10-19', SUBJECTS, tasks);
    expect(plan.map((x) => [x.item.subject, x.subjectId, x.taskId])).toEqual([
      ['Математика', 1, 10],
      ['Русский язык', 2, 11],
      ['Казахский язык и литература', 3, null],
    ]);
    expect(plan[0].item.homework).toBe('Стр. 42, № 5 и 6\nЕщё задача 7');
    expect(planImport(items, '2026-10-30', SUBJECTS, tasks)).toEqual([]);
  });
});

describe('pasted homework', () => {
  it('splits "Subject: text" lines (ru / kk / en) and keeps continuation lines', () => {
    expect(parsePasted('Математика: стр. 42\nещё № 7\nҚазақ тілі — жаттығу 5\nEnglish - ex. 3')).toEqual([
      { subject: 'Математика', homework: 'стр. 42\nещё № 7' },
      { subject: 'Қазақ тілі', homework: 'жаттығу 5' },
      { subject: 'English', homework: 'ex. 3' },
    ]);
  });
  it('text without a subject becomes one item to assign by hand', () => {
    expect(parsePasted('прочитать рассказ\nи пересказать')).toEqual([{ subject: '', homework: 'прочитать рассказ\nи пересказать' }]);
    expect(parsePasted('   ')).toEqual([]);
  });
});

describe('WebView bridge', () => {
  it('accepts only the three known message types', () => {
    expect(readMessage(JSON.stringify({ type: 'diary', payloads: [diary] }))).toEqual({ type: 'diary', payloads: [diary] });
    expect(readMessage('{"type":"need_login"}')).toEqual({ type: 'need_login' });
    expect(readMessage('{"type":"error","message":"HTTP 500"}')).toEqual({ type: 'error', message: 'HTTP 500' });
    expect(readMessage('{"type":"token","value":"eyJ..."}')).toBeNull();
    expect(readMessage('not json')).toBeNull();
  });
  it('the injected script never posts the token or the password and parses as JavaScript', () => {
    expect(() => new Function(READ_DIARY_JS)).not.toThrow();
    expect(READ_DIARY_JS).not.toMatch(/password/i);
    expect(READ_DIARY_JS).not.toMatch(/post\(\{[^}]*token/);
  });
});
