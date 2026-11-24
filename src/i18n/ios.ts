import type { Bundle } from './types';

// Store-specific copy; capabilities and server platform identifiers remain unchanged.
export default {
  "ru": {
    "loc.intro": "Когда включено, телефон ребёнка периодически отправляет своё местоположение, и вы видите его здесь на карте. Ребёнок видит это открыто: постоянный значок геолокации и уведомление в приложении. Полностью запретить ребёнку выключить геолокацию на обычном телефоне нельзя — но как только он её выключит или уберёт доступ, вам сразу придёт уведомление.",
    "loc.never.text": "Пусть ребёнок откроет «Контроль ДЗ» на своём телефоне и разрешит доступ к геолокации — после этого точка появится здесь.",
    "devices.kind.android": "Телефон",
    "screen.enabledOn": "Правила включены для устройств ребёнка",
    "screen.intro": "Правила экранного времени настраиваются отдельно. На iPhone ребёнка подтвердите доступ через «Семейный доступ» Apple и выберите приложения на самом устройстве.",
    "screen.picker.noneText": "Список появится после подключения поддерживаемого устройства ребёнка. Для iPhone приложения выбираются на самом устройстве.",
    "screen.guard.noneText": "Откройте приложение на устройстве ребёнка и настройте экранное время. На iPhone выбор приложений и статистика доступны на самом устройстве.",
    "screen.ios.parentHow": "Приложения выбираются на самом iPhone ребёнка: откройте там «Контроль ДЗ», подтвердите разрешение своим Apple ID и отметьте приложения в списке Apple.",
    "parent.phone.intro": "Встроенное «Экранное время» Apple позволяет родителю настроить ограничения на iPhone ребёнка. Следуйте инструкции ниже.",
    "parent.settings.phoneSub": "Экранное время Apple",
    "parent.phone.openFail": "Откройте «Экранное время» в настройках iPhone.",
    "parent.settings.pushSub": "Включатся после публикации в App Store",
    "parent.paywall.unavailable": "Оплата станет доступна в версии из App Store.",
    "parent.settings.deleteMsg": "Будут безвозвратно удалены расписание, задания, история и все фото, а все телефоны семьи отключатся. Подписку в App Store отмените отдельно в настройках магазина."
  },
  "kk": {
    "loc.intro": "Қосулы кезде баланың телефоны орналасуын мезгіл-мезгіл жібереді, сіз оны осы жерде картадан көресіз. Бала мұны ашық көреді: тұрақты геолокация белгісі және қолданбадағы хабарлама. Кәдімгі телефонда баланың геолокацияны өшіруіне толық тыйым салу мүмкін емес — бірақ ол өшірген не рұқсатты алып тастаған сәтте сізге бірден хабарлама келеді.",
    "loc.never.text": "Бала өз телефонында «Контроль ДЗ»-ны ашып, геолокацияға рұқсат берсін — содан кейін нүкте осы жерде пайда болады.",
    "devices.kind.android": "Телефон",
    "screen.enabledOn": "Бала құрылғыларына ережелер қосылды",
    "screen.intro": "Экран уақыты ережелері бөлек бапталады. Баланың iPhone құрылғысында Apple отбасылық рұқсатын растап, қолданбаларды сол құрылғыда таңдаңыз.",
    "screen.picker.noneText": "Тізім баланың қолдау көрсетілетін құрылғысы қосылғанда пайда болады. iPhone қолданбалары сол құрылғыда таңдалады.",
    "screen.guard.noneText": "Баланың құрылғысында қолданбаны ашып, экран уақытын баптаңыз. iPhone қолданбаларын таңдау және статистика сол құрылғыда қолжетімді.",
    "screen.ios.parentHow": "Қолданбалар баланың iPhone құрылғысында таңдалады: қолданбаны ашып, Apple ID арқылы рұқсатты растаңыз және Apple тізімінен қолданбаларды таңдаңыз.",
    "parent.phone.intro": "Apple Экран уақыты ата-анаға баланың iPhone құрылғысында шектеулерді баптауға мүмкіндік береді. Төмендегі нұсқаулықты орындаңыз.",
    "parent.settings.phoneSub": "Apple Экран уақыты",
    "parent.phone.openFail": "iPhone параметрлерінде Экран уақытын ашыңыз.",
    "parent.settings.pushSub": "App Store-ға шыққаннан кейін қосылады",
    "parent.paywall.unavailable": "Төлем App Store-дағы нұсқада қолжетімді болады.",
    "parent.settings.deleteMsg": "Кесте, тапсырмалар, тарих және барлық фото біржола жойылады, ал отбасының барлық телефоны ажыратылады. App Store-дегі жазылымды дүкен баптауларынан бөлек тоқтатыңыз."
  },
  "en": {
    "loc.intro": "When on, the child’s phone reports its location periodically and you see it here on the map. The child sees this openly: a persistent location icon and an in-app notice. A normal phone cannot be stopped from turning location off — but the moment the child does, or revokes access, you get a notification right away.",
    "loc.never.text": "Have the child open «Контроль ДЗ» on their phone and allow location access — the point will then appear here.",
    "devices.kind.android": "Phone",
    "screen.enabledOn": "Rules are enabled for your child’s devices",
    "screen.intro": "Screen Time rules are configured separately. On the child’s iPhone, authorize through Apple Family Sharing and choose apps on that device.",
    "screen.picker.noneText": "The list appears after a supported child device connects. On iPhone, apps are selected on the device itself.",
    "screen.guard.noneText": "Open the app on the child’s device and set up Screen Time. On iPhone, app selection and usage statistics are available on that device.",
    "screen.ios.parentHow": "Choose apps on the child’s iPhone: open Kontrol DZ there, authorize with your Apple ID and select apps in Apple’s picker.",
    "parent.phone.intro": "Apple Screen Time lets a parent configure restrictions on the child’s iPhone. Follow the steps below.",
    "parent.settings.phoneSub": "Apple Screen Time",
    "parent.phone.openFail": "Open Screen Time in iPhone Settings.",
    "parent.settings.pushSub": "Will turn on after release on the App Store",
    "parent.paywall.unavailable": "Payment will be available in the App Store version.",
    "parent.settings.deleteMsg": "The schedule, tasks, history and all photos will be permanently deleted, and all family phones will be signed out. Cancel your App Store subscription separately in the store settings."
  }
} satisfies Bundle;
