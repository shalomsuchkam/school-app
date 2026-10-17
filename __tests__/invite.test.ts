import { codeFromLink, codeFromParam, joinLink, normalizeCode } from '@/lib/invite';

describe('invite links', () => {
  it('reads the code from the deep link, the web invite page and shared text', () => {
    expect(codeFromLink('uroki://join?code=K7QMZP')).toBe('K7QMZP');
    expect(codeFromLink('uroki://join?lang=ru&code=k7qmzp')).toBe('K7QMZP');
    expect(codeFromLink('https://abc.supabase.co/functions/v1/app/i/K7QMZP')).toBe('K7QMZP');
    expect(codeFromLink('https://abc.supabase.co/functions/v1/app/i/K7QMZP?lang=kk')).toBe('K7QMZP');
    expect(codeFromLink('Приглашение в «Уроки»: https://x.kz/app/i/AB12CD\nКод: AB12CD')).toBe('AB12CD');
    expect(codeFromLink(' ab12cd ')).toBe('AB12CD');
  });

  it('rejects anything without a well-formed 6-character code', () => {
    expect(codeFromLink('uroki://join')).toBeNull();
    expect(codeFromLink('uroki://join?code=ABC')).toBeNull();
    expect(codeFromLink('uroki://join?code=ABCDEFG')).toBeNull();
    expect(codeFromLink('https://x.kz/app/i/TOOLONGCODE')).toBeNull();
    expect(codeFromLink('')).toBeNull();
    expect(codeFromLink(null)).toBeNull();
  });

  it('router params: string or repeated array, normalised, complete codes only', () => {
    expect(codeFromParam('k7qmzp')).toBe('K7QMZP');
    expect(codeFromParam(['K7-QMZP', 'XXXXXX'])).toBe('K7QMZP');
    expect(codeFromParam('K7Q')).toBeNull();
    expect(codeFromParam(undefined)).toBeNull();
  });

  it('normalises typed codes and builds the deep link', () => {
    expect(normalizeCode('k7 qm-zp99')).toBe('K7QMZP');
    expect(joinLink('K7QMZP')).toBe('uroki://join?code=K7QMZP');
    expect(codeFromLink(joinLink('A1B2C3'))).toBe('A1B2C3');
  });
});
