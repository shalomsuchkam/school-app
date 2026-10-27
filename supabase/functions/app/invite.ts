// Public invite page served at /i/<code> (the link and QR code the parent shares). It opens the app with the
// code (uroki://join?code=…), shows the code for typing by hand and links to the stores. It never reads the
// database: the page looks the same for a valid, used or made-up code and shows no family or child names.
type L = "ru" | "kk" | "en";

const SCHEME = "uroki"; // app.json "scheme"
const PLAY_ID = "kz.uroki.app";
// the App Store id is known only once the app is published: set APP_STORE_URL in the function's env then
const APP_STORE = Deno.env.get("APP_STORE_URL") || "https://apps.apple.com/search?term=%D0%A3%D1%80%D0%BE%D0%BA%D0%B8";

const TEXT: Record<L, { title: string; lead: string; open: string; code: string; hint: string; get: string; ios: string; android: string }> = {
  ru: {
    title: "Приглашение в «Контроль ДЗ»", lead: "Вас пригласили в семью в приложении «Контроль ДЗ».", open: "Открыть в приложении «Контроль ДЗ»",
    code: "Код приглашения", hint: "Если кнопка не сработала, откройте приложение и введите этот код. Код действует 48 часов и только один раз.",
    get: "Ещё нет приложения?", ios: "App Store", android: "Google Play",
  },
  kk: {
    title: "«Контроль ДЗ» шақыруы", lead: "Сізді «Контроль ДЗ» қосымшасындағы отбасына шақырды.", open: "«Контроль ДЗ» қосымшасында ашу",
    code: "Шақыру коды", hint: "Батырма жұмыс істемесе, қосымшаны ашып, осы кодты енгізіңіз. Код 48 сағат және бір рет қана жарамды.",
    get: "Қосымша әлі жоқ па?", ios: "App Store", android: "Google Play",
  },
  en: {
    title: "Invitation to Контроль ДЗ", lead: "You have been invited to a family in the Контроль ДЗ app.", open: "Open in Контроль ДЗ",
    code: "Invite code", hint: "If the button does not work, open the app and enter this code. It works once and for 48 hours.",
    get: "Don't have the app yet?", ios: "App Store", android: "Google Play",
  },
};

// escapes for text and attribute values
const h = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ?lang wins; otherwise the first supported language of Accept-Language; Russian by default.
export function inviteLang(query: string | null, accept: string | null): L {
  if (query === "ru" || query === "kk" || query === "en") return query;
  for (const part of (accept ?? "").toLowerCase().split(",")) {
    const tag = part.trim().split(";")[0].split("-")[0];
    if (tag === "ru" || tag === "kk" || tag === "en") return tag;
  }
  return "ru";
}

// Invite codes are A–Z / 2–9 (randomCode); anything else is dropped before it reaches the page.
export const inviteCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

export function invitePage(rawCode: string, lang: L, userAgent: string | null) {
  const code = inviteCode(rawCode);
  const t = TEXT[lang];
  const deep = `${SCHEME}://join?code=${encodeURIComponent(code)}`;
  const play = /android/i.test(userAgent ?? "") ? `market://details?id=${PLAY_ID}` : `https://play.google.com/store/apps/details?id=${PLAY_ID}`;
  const self = (l: L) => `?lang=${l}`;
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${h(t.title)}</title>
<style>*{box-sizing:border-box}body{font:16px/1.5 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;margin:0;padding:24px 16px 48px;color:#1b1b29;background:#f6f5ff}
main{max-width:440px;margin:0 auto;text-align:center}h1{font-size:24px;line-height:1.25;margin:8px 0 4px}p{margin:8px 0}
.btn{display:block;width:100%;padding:16px;border-radius:14px;background:#6355f5;color:#fff;font-size:18px;font-weight:600;text-decoration:none;margin:20px 0}
.code{font:700 40px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:6px;padding:14px;border-radius:14px;background:#fff;border:2px dashed #c9c4ff;margin:8px 0;word-break:break-all;user-select:all}
.muted{color:#5f5f73;font-size:14px}.stores{display:flex;gap:10px;margin-top:10px}.stores a{flex:1;padding:12px;border-radius:12px;border:1px solid #c9c4ff;color:#6355f5;text-decoration:none;font-weight:600;background:#fff}
nav{font-size:14px;margin-bottom:12px}nav a{color:#6355f5;margin:0 6px}
@media(prefers-color-scheme:dark){body{color:#ececf5;background:#111118}.code,.stores a{background:#1c1c28;border-color:#3b3570}.muted{color:#a0a0b8}nav a,.stores a{color:#8478ff}}</style></head><body><main>
<nav><a href="${h(self("ru"))}">Русский</a><a href="${h(self("kk"))}">Қазақша</a><a href="${h(self("en"))}">English</a></nav>
<div style="font-size:48px">📚</div>
<h1>${h(t.title)}</h1>
<p>${h(t.lead)}</p>
<a class="btn" href="${h(deep)}">${h(t.open)}</a>
<p class="muted">${h(t.code)}</p>
<div class="code">${h(code)}</div>
<p class="muted">${h(t.hint)}</p>
<p style="margin-top:28px"><b>${h(t.get)}</b></p>
<div class="stores"><a href="${h(APP_STORE)}">${h(t.ios)}</a><a href="${h(play)}">${h(t.android)}</a></div>
</main></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // the code is a secret of sorts: no caching, no referrer to the stores, no scripts at all
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
