// Frames raw app screens into store screenshots with captions («Тетрадь» style).
// usage: node compose.js <rawPhoneDir> <rawIpadDir> <outDir> <iconPng>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const [, , RAW, RAW_IPAD, OUT, ICON] = process.argv;

const shots = [
  ['1-parent-today', 'Домашка под&nbsp;контролем', 'Что сделано, когда и&nbsp;с&nbsp;фото'],
  ['2-child', 'Ребёнок видит, что&nbsp;осталось', 'Отмечает задания и&nbsp;фотографирует тетрадь'],
  ['3-screen', 'Игры — после уроков', 'Лимиты, сон и&nbsp;школа на&nbsp;телефоне ребёнка'],
  ['4-skip', 'Пропуск — только с&nbsp;вашего «да»', 'Принимайте работу или просите переснять'],
  ['5-calendar', 'Весь месяц на&nbsp;одном экране', 'Вовремя, с&nbsp;опозданием, не&nbsp;сделано'],
  ['6-chat', 'Вопрос по&nbsp;задаче — прямо в&nbsp;задании', 'Чат и&nbsp;голосовые заметки'],
  ['7-schedule', 'Расписание за&nbsp;пару минут', 'Уроки, дела по&nbsp;дому и&nbsp;напоминания'],
  ['8-invite', 'Вся семья по&nbsp;QR-коду', 'Ребёнок, второй родитель, репетитор'],
];

const sizes = [
  { dir: 'appstore-iphone-6.9', w: 1320, h: 2868, raw: RAW, ar: 932 / 430 },
  { dir: 'appstore-iphone-6.5', w: 1284, h: 2778, raw: RAW, ar: 932 / 430 },
  { dir: 'appstore-ipad-13', w: 2064, h: 2752, raw: RAW_IPAD, ar: 1366 / 1024, tablet: true },
  { dir: 'play-phone', w: 1080, h: 1920, raw: RAW, ar: 932 / 430 },
];

const dataUrl = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

function frame(s, img, title, sub) {
  const { w, h, ar, tablet } = s;
  const k = tablet ? w / 2064 : w / 1320; // scale against the reference widths
  const titleSize = Math.round((tablet ? 104 : 100) * k);
  const subSize = Math.round(titleSize * 0.46);
  const bezel = Math.round((tablet ? 28 : 22) * k);
  const sbar = Math.round((tablet ? 44 : 100) * k);
  const rule = Math.round(64 * w / 1320);
  const left = Math.round(w * 0.1);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  html,body{width:${w}px;height:${h}px;overflow:hidden}
  body{background:#F4F2ED;font-family:Inter,'Inter Display',sans-serif;color:#1A1916;position:relative;
    background-image:repeating-linear-gradient(to bottom,transparent 0,transparent ${rule - 2}px,#D9E2EE ${rule - 2}px,#D9E2EE ${rule}px);}
  .margin{position:absolute;top:0;bottom:0;left:${Math.round(w * 0.06)}px;width:${Math.max(3, Math.round(4 * k))}px;background:#E7A39B}
  .cap{position:absolute;left:${left}px;right:${Math.round(w * 0.07)}px;top:${Math.round(h * 0.045)}px;}
  h1{font-family:'Inter Display',Inter,sans-serif;font-weight:800;font-size:${titleSize}px;line-height:1.06;letter-spacing:-0.035em;text-wrap:balance}
  p{margin-top:${Math.round(subSize * 0.6)}px;font-size:${subSize}px;line-height:1.3;color:#46433D;font-weight:500;letter-spacing:-0.01em;text-wrap:balance}
  .mark{display:block;width:${Math.round(titleSize * 0.85)}px;height:${Math.round(titleSize * 0.85)}px;border-radius:${Math.round(titleSize * 0.22)}px;margin-bottom:${Math.round(subSize * 0.8)}px;}
  .dev{position:absolute;padding:${bezel}px;background:#1A1916;
    box-shadow:0 ${Math.round(40 * k)}px ${Math.round(90 * k)}px -${Math.round(30 * k)}px rgba(74,63,42,.55)}
  .scr{overflow:hidden;background:#F4F2ED}
  .sb{height:${sbar}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${Math.round(sbar * (tablet ? 0.6 : 0.6))}px;font-weight:600;font-size:${Math.round(sbar * 0.36)}px;color:#1A1916}
  .bat{display:inline-block;width:${Math.round(sbar * 0.5)}px;height:${Math.round(sbar * 0.24)}px;border:${Math.max(2, Math.round(sbar * 0.03))}px solid #1A1916;border-radius:${Math.round(sbar * 0.07)}px;position:relative;margin-left:${Math.round(sbar * 0.12)}px}
  .bat::after{content:'';position:absolute;inset:${Math.max(1, Math.round(sbar * 0.025))}px;background:#1A1916;border-radius:${Math.round(sbar * 0.03)}px}
  .sig{display:inline-flex;gap:${Math.round(sbar * 0.04)}px;align-items:flex-end;height:${Math.round(sbar * 0.24)}px}
  .sig i{display:block;width:${Math.round(sbar * 0.06)}px;background:#1A1916;border-radius:2px}
  .scr img{display:block}
  </style></head><body><div class="margin"></div>
  <div class="cap"><img class="mark" src="${dataUrl(ICON)}"><h1>${title}</h1><p>${sub}</p></div>
  <div class="dev"><div class="scr"><div class="sb"><span>9:41</span><span><span class="sig"><i style="height:35%"></i><i style="height:55%"></i><i style="height:75%"></i><i style="height:100%"></i></span><span class="bat"></span></span></div><img src="${dataUrl(img)}"></div></div>
  <script>
  (function(){
    const W=${w},H=${h},ar=${ar},bezel=${bezel},sbar=${sbar},tablet=${!!tablet};
    const capBottom=document.querySelector('.cap').getBoundingClientRect().bottom;
    const top=capBottom+Math.round(H*0.03), bottomGap=Math.round(H*0.035);
    let scrW=Math.round(W*(tablet?0.8:0.76));
    const fit=(H-top-bottomGap-sbar-2*bezel)/ar;
    if(scrW>fit) scrW=Math.floor(fit);
    const devW=scrW+2*bezel, r=Math.round(devW*(tablet?0.045:0.12));
    const d=document.querySelector('.dev');
    Object.assign(d.style,{left:Math.round((W-devW)/2+W*0.015)+'px',top:top+'px',width:devW+'px',borderRadius:r+'px'});
    document.querySelector('.scr').style.borderRadius=(r-bezel)+'px';
    const im=document.querySelector('.scr img'); im.style.width=scrW+'px'; im.style.height=Math.round(scrW*ar)+'px';
  })();
  </script></body></html>`;
}

function feature() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}html,body{width:1024px;height:500px;overflow:hidden}
  body{background:#F4F2ED;font-family:Inter,sans-serif;color:#1A1916;position:relative;
   background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 30px,#D9E2EE 30px,#D9E2EE 32px)}
  .margin{position:absolute;top:0;bottom:0;left:44px;width:3px;background:#E7A39B}
  .t{position:absolute;left:84px;top:92px;width:520px}
  .t img{width:88px;height:88px;border-radius:22px;display:block;margin-bottom:26px}
  h1{font-family:'Inter Display',Inter;font-weight:800;font-size:68px;letter-spacing:-0.035em;line-height:1}
  p{margin-top:18px;font-size:27px;line-height:1.3;color:#46433D;font-weight:500}
  .ph{position:absolute;right:70px;top:56px;width:300px;padding:12px;border-radius:44px;background:#1A1916;transform:rotate(-4deg);box-shadow:0 30px 60px -24px rgba(74,63,42,.6)}
  .ph img{display:block;width:100%;border-radius:33px}
  </style></head><body><div class="margin"></div>
  <div class="t"><img src="${dataUrl(ICON)}"><h1>Контроль ДЗ</h1><p>Домашка, дела и экранное время ребёнка — без вечерних споров</p></div>
  <div class="ph"><img src="${dataUrl(path.join(RAW, '1-parent-today.png'))}"></div>
  </body></html>`;
}

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ deviceScaleFactor: 1 });
  const render = async (html, w, h, file, jpeg) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(50);
    await page.screenshot({ path: file, type: jpeg ? 'jpeg' : 'png', quality: jpeg ? 92 : undefined, omitBackground: false });
  };
  for (const s of sizes) {
    fs.mkdirSync(path.join(OUT, s.dir), { recursive: true });
    for (const [name, title, sub] of shots) {
      const img = path.join(s.raw, name + '.png');
      await render(frame(s, img, title, sub), s.w, s.h, path.join(OUT, s.dir, `${name}.png`));
    }
    console.log('done', s.dir);
  }
  fs.mkdirSync(path.join(OUT, 'play'), { recursive: true });
  await render(feature(), 1024, 500, path.join(OUT, 'play', 'feature-graphic-1024x500.png'));
  fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify(shots.map(([n, t, s]) => ({ screen: n, title: t.replace(/&nbsp;/g, ' '), subtitle: s.replace(/&nbsp;/g, ' ') })), null, 2) + '\n');
  await b.close();
})();
