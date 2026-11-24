import ios from '@/i18n/ios';
import { DICT } from '@/i18n';
import type { Lang } from '@/i18n';
const hidden = /^(owner\.|parent\.phone\.(android|a[1-5]|iosHint|openFL)$|parent\.paywall\.legalAndroid$)/;
for (const lang of ['ru','kk','en'] as Lang[]) {
  it(`keeps visible iOS store copy free of competing platform references (${lang})`, () => {
    const dictionary = { ...DICT[lang], ...ios[lang] };
    for (const [key, value] of Object.entries(dictionary)) {
      if (!hidden.test(key)) expect({ key, value: String(value) }).not.toEqual(expect.objectContaining({ value: expect.stringMatching(/Android|Google Play|Family Link/i) }));
    }
  });
}
